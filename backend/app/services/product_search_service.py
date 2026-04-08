"""
Product technical information search service.
Searches the web for product specs and caches results in the database.
Uses Claude to extract ONLY technical characteristics, not prices or store links.
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
    """Search for product technical specs online.

    Strategy:
    1. DuckDuckGo search for specs/ficha técnica
    2. Fetch first relevant page
    3. Use Claude to extract ONLY technical characteristics (dimensions, materials,
       features, compatibility) — NOT prices, NOT store names
    4. Return structured specs dict

    Returns dict with specs or None.
    """
    try:
        import httpx
        from bs4 import BeautifulSoup

        query = f"{descripcion} {codigo} especificaciones técnicas características"
        url = f"https://html.duckduckgo.com/html/?q={httpx.QueryParams({'q': query})}"

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AlbaranProcessor/1.0)",
            "Accept-Language": "es-ES,es;q=0.9",
        }

        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return None

            soup = BeautifulSoup(resp.text, "html.parser")
            result_links = soup.find_all("a", class_="result__url")
            if not result_links:
                return None

            # Try up to 3 results to find one with specs
            for link_el in result_links[:3]:
                first_url = link_el.get_text(strip=True)
                if not first_url.startswith("http"):
                    first_url = "https://" + first_url

                # Skip obvious retailer/marketplace URLs
                skip_domains = ["amazon.", "ebay.", "aliexpress.", "leroy", "bricomart", "leroymerlin", "aki.es"]
                if any(d in first_url.lower() for d in skip_domains):
                    continue

                try:
                    page_resp = await client.get(first_url, headers=headers, timeout=10)
                    if page_resp.status_code != 200:
                        continue

                    page_soup = BeautifulSoup(page_resp.text, "html.parser")
                    # Extract only the text content (strip scripts/styles)
                    for tag in page_soup(["script", "style", "nav", "footer", "header"]):
                        tag.decompose()
                    page_text = page_soup.get_text(separator="\n", strip=True)[:8000]

                    specs = await _extract_specs_with_claude(descripcion, codigo, page_text)
                    if specs:
                        return specs

                except Exception as e:
                    logger.warning(f"Could not fetch {first_url}: {e}")
                    continue

        return None

    except Exception as e:
        logger.error(f"Product search failed: {e}")
        return None


async def _extract_specs_with_claude(descripcion: str, codigo: str, page_text: str) -> Optional[dict]:
    """Use Claude to extract only technical characteristics from page text.
    Returns a dict of spec_name -> value, or None if nothing useful found.
    """
    from app.config import settings as app_settings

    if not app_settings.anthropic_api_key:
        # Fallback: basic regex-based extraction without Claude
        return _extract_specs_basic(page_text)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=app_settings.anthropic_api_key)

        prompt = f"""Producto: {descripcion} (código: {codigo})

Texto extraído de una página web:
---
{page_text}
---

Extrae ÚNICAMENTE las especificaciones técnicas del producto (dimensiones, peso, materiales, acabado, potencia, capacidad, compatibilidad, normas, etc.).
NO incluyas: precios, nombres de tiendas, opiniones de usuarios, textos de marketing, información de envío.

Responde SOLO con un objeto JSON donde cada clave es el nombre de la especificación y el valor es el dato.
Máximo 15 especificaciones. Si no hay especificaciones técnicas relevantes, responde: {{}}"""

        message = client.messages.create(
            model=app_settings.claude_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = message.content[0].text.strip()
        # Strip markdown if present
        import re
        if response_text.startswith("```"):
            response_text = re.sub(r"```[a-z]*\n?", "", response_text).strip().rstrip("`").strip()

        specs = json.loads(response_text)
        if not isinstance(specs, dict) or len(specs) == 0:
            return None
        return specs

    except Exception as e:
        logger.warning(f"Claude spec extraction failed: {e}")
        return _extract_specs_basic(page_text)


def _extract_specs_basic(page_text: str) -> Optional[dict]:
    """Fallback: extract specs from tables/definition lists without Claude."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(page_text, "html.parser")
    specs = {}

    for table in soup.find_all("table")[:3]:
        for row in table.find_all("tr")[:15]:
            cells = row.find_all(["td", "th"])
            if len(cells) == 2:
                k = cells[0].get_text(strip=True)
                v = cells[1].get_text(strip=True)
                if k and v and len(k) < 60 and len(v) < 200:
                    specs[k] = v
        if len(specs) >= 5:
            break

    return dict(list(specs.items())[:15]) if specs else None


async def get_or_search_product(
    article_id: int,
    codigo: str,
    descripcion: str,
    db,
) -> Optional[object]:
    """Get product info from cache or trigger a new search."""
    from app.models.product_info import ProductInfo

    existing = db.query(ProductInfo).filter(
        ProductInfo.codigo_principal == codigo
    ).first()

    if existing and existing.specs:
        return existing

    specs_data = await search_product_info(codigo, descripcion, db)

    if existing is None:
        product_info = ProductInfo(
            codigo_principal=codigo,
            descripcion=descripcion,
            specs=json.dumps(specs_data) if specs_data else None,
            search_attempted=True,
            cached_at=datetime.now(timezone.utc),
        )
        db.add(product_info)
    else:
        existing.specs = json.dumps(specs_data) if specs_data else None
        existing.search_attempted = True
        existing.cached_at = datetime.now(timezone.utc)
        product_info = existing

    db.commit()
    db.refresh(product_info)
    return product_info
