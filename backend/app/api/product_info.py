"""
Product information endpoints.
Used for QR code landing pages and product spec management.
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product_info import ProductInfo
from app.models.article import Article
from app.schemas.settings import ProductInfoResponse, ProductInfoUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/products", tags=["products"])


def product_to_response(p: ProductInfo) -> ProductInfoResponse:
    specs = None
    if p.specs:
        try:
            specs = json.loads(p.specs) if isinstance(p.specs, str) else p.specs
        except Exception:
            specs = {"raw": p.specs}

    return ProductInfoResponse(
        id=p.id,
        codigo_principal=p.codigo_principal,
        descripcion=p.descripcion,
        specs=specs,
        source_url=p.source_url,
        manual_url=p.manual_url,
        search_attempted=p.search_attempted,
        cached_at=p.cached_at,
    )


@router.get("/{product_id}", response_model=ProductInfoResponse)
def get_product_info(product_id: int, db: Session = Depends(get_db)):
    """Get product info by ID (used by QR code landing page)."""
    product = db.query(ProductInfo).filter(ProductInfo.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product info not found")
    return product_to_response(product)


@router.get("/by-code/{code}", response_model=ProductInfoResponse)
def get_product_by_code(code: str, db: Session = Depends(get_db)):
    """Get product info by codigo_principal."""
    product = db.query(ProductInfo).filter(ProductInfo.codigo_principal == code).first()
    if not product:
        raise HTTPException(404, "Product not found")
    return product_to_response(product)


@router.put("/{product_id}", response_model=ProductInfoResponse)
def update_product_info(
    product_id: int,
    update: ProductInfoUpdate,
    db: Session = Depends(get_db),
):
    """Update product info (manual URL or specs)."""
    product = db.query(ProductInfo).filter(ProductInfo.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product not found")

    if update.manual_url is not None:
        product.manual_url = update.manual_url
    if update.specs is not None:
        product.specs = json.dumps(update.specs)

    db.commit()
    db.refresh(product)
    return product_to_response(product)


@router.post("/{product_id}/search")
async def trigger_product_search(
    product_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger a web search for product technical info."""
    product = db.query(ProductInfo).filter(ProductInfo.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product not found")

    background_tasks.add_task(
        _search_product_bg,
        product_id,
        product.codigo_principal,
        product.descripcion,
    )

    return {"ok": True, "message": "Search started in background"}


@router.post("/ensure/{article_id}")
async def ensure_product_info(
    article_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Ensure product info exists for an article (creates if not found)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(404, "Article not found")

    if article.product_info_id:
        product = db.query(ProductInfo).filter(ProductInfo.id == article.product_info_id).first()
        if product:
            return product_to_response(product)

    # Create or find product info
    codigo = article.codigo_principal or f"ART-{article.id:04d}"
    existing = db.query(ProductInfo).filter(ProductInfo.codigo_principal == codigo).first()

    if not existing:
        product = ProductInfo(
            codigo_principal=codigo,
            descripcion=article.descripcion,
            search_attempted=False,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        article.product_info_id = product.id
        db.commit()

        # Trigger background search
        background_tasks.add_task(
            _search_product_bg,
            product.id,
            codigo,
            article.descripcion,
        )
        return product_to_response(product)
    else:
        article.product_info_id = existing.id
        db.commit()
        return product_to_response(existing)


async def _search_product_bg(product_id: int, codigo: str, descripcion: str):
    """Background task to search for product info."""
    from app.database import SessionLocal
    from app.services.product_search_service import search_product_info
    import json

    db = SessionLocal()
    try:
        product = db.query(ProductInfo).filter(ProductInfo.id == product_id).first()
        if not product or product.search_attempted:
            return

        specs = await search_product_info(codigo, descripcion, db)

        if specs:
            source_url = specs.pop("_source_url", None)
            product.specs = json.dumps(specs)
            product.source_url = source_url
        product.search_attempted = True
        db.commit()

    except Exception as e:
        logger.error(f"Product search bg task failed: {e}")
    finally:
        db.close()
