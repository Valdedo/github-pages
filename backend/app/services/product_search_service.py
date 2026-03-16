"""
Product technical information search service.
Searches the web for product specs and caches results in the database.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


async def search_product_info(
    codigo: str,
    descripcion: str,
    db=None,
) -> Optional[dict]:
    """Search for product technical info online.

    Strategy:
    1. Build search query from code + description
    2. Use a web search (DuckDuckGo scraper, no API key needed)
    3. Fetch first relevant result
    4. Extract key specs
    5. Cache in DB

    Returns dict with specs or None if not found.
    """
    try:
        import httpx
        from bs4 import BeautifulSoup

        query = f"{descripcion} {codigo} ficha técnica especificaciones".strip()
        url = f"https://html.duckduckgo.com/html/?q={httpx.QueryParams({'q': query})}"

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AlbaranProcessor/1.0)",
            "Accept-Language": "es-ES,es;q=0.9",
        }

        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"DuckDuckGo search failed: {resp.status_code}")
                return None

            soup = BeautifulSoup(resp.text, "html.parser")
            results = soup.find_all("a", class_="result__url")
            if not results:
                return None

            # Take first result URL
            first_url = results[0].get_text(strip=True)
            if not first_url.startswith("http"):
                first_url = "https://" + first_url

            # Fetch that page
            try:
                page_resp = await client.get(first_url, headers=headers, timeout=10)
                if page_resp.status_code != 200:
                    return None

                page_soup = BeautifulSoup(page_resp.text, "html.parser")

                # Extract basic specs from page
                specs = extract_specs_from_page(page_soup, descripcion)
                specs["_source_url"] = first_url

                return specs

            except Exception as e:
                logger.warning(f"Could not fetch product page {first_url}: {e}")
                return None

    except Exception as e:
        logger.error(f"Product search failed: {e}")
        return None


def extract_specs_from_page(soup, descripcion: str) -> dict:
    """Extract technical specs from a product page HTML."""
    specs = {}

    # Try to find specification tables
    tables = soup.find_all("table")
    for table in tables[:3]:  # check first 3 tables
        rows = table.find_all("tr")
        for row in rows[:15]:
            cells = row.find_all(["td", "th"])
            if len(cells) == 2:
                key = cells[0].get_text(strip=True)
                val = cells[1].get_text(strip=True)
                if key and val and len(key) < 60 and len(val) < 200:
                    specs[key] = val
        if len(specs) >= 5:
            break

    # Try definition lists (common on product pages)
    if len(specs) < 3:
        for dl in soup.find_all("dl")[:3]:
            dts = dl.find_all("dt")
            dds = dl.find_all("dd")
            for dt, dd in zip(dts, dds):
                key = dt.get_text(strip=True)
                val = dd.get_text(strip=True)
                if key and val and len(key) < 60:
                    specs[key] = val[:200]

    # Limit to 15 most relevant specs
    return dict(list(specs.items())[:15])


async def get_or_search_product(
    article_id: int,
    codigo: str,
    descripcion: str,
    db,
) -> Optional[object]:
    """Get product info from cache or trigger a new search.

    Returns ProductInfo ORM object or None.
    """
    from app.models.product_info import ProductInfo

    # Check cache
    existing = db.query(ProductInfo).filter(
        ProductInfo.codigo_principal == codigo
    ).first()

    if existing:
        if existing.search_attempted and not existing.specs:
            # Already tried and failed; don't retry
            return existing
        if existing.specs:
            return existing

    # Not in cache or no specs found yet → search
    specs_data = await search_product_info(codigo, descripcion, db)

    if existing is None:
        product_info = ProductInfo(
            codigo_principal=codigo,
            descripcion=descripcion,
            specs=json.dumps(specs_data) if specs_data else None,
            source_url=specs_data.pop("_source_url", None) if specs_data else None,
            search_attempted=True,
            cached_at=datetime.now(timezone.utc),
        )
        db.add(product_info)
    else:
        source_url = None
        if specs_data:
            source_url = specs_data.pop("_source_url", None)
        existing.specs = json.dumps(specs_data) if specs_data else None
        existing.source_url = source_url
        existing.search_attempted = True
        existing.cached_at = datetime.now(timezone.utc)
        product_info = existing

    db.commit()
    db.refresh(product_info)
    return product_info
