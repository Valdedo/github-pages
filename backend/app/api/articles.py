"""
Article CRUD and margin recalculation endpoints.
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.app_settings import AppSettings
from app.schemas.article import ArticleCreate, ArticleUpdate, ArticleResponse
from app.services.margin_service import compute_article_pricing

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/articles", tags=["articles"])


def get_settings(db: Session) -> AppSettings:
    s = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not s:
        s = AppSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def recalc_article(article: Article, settings: AppSettings) -> Article:
    """Recalculate pricing for an article based on current settings."""
    tiers = json.loads(settings.margin_tiers) if isinstance(settings.margin_tiers, str) else []

    pricing = compute_article_pricing(
        precio_bruto=article.precio_unitario_bruto,
        cantidad=article.cantidad,
        descuento_1=article.descuento_1,
        descuento_2=article.descuento_2,
        descuento_3=article.descuento_3,
        descuento_4=article.descuento_4,
        iva_pct=article.iva_pct,
        margen_pct_override=article.margen_pct if article.margen_override else None,
        tiers=tiers,
        rounding_mode=settings.rounding_mode,
        decimals=settings.rounding_decimals,
    )

    article.coste_neto_unitario = pricing["coste_neto_unitario"]
    article.coste_neto_total = pricing["coste_neto_total"]
    article.margen_pct = pricing["margen_pct"]
    article.margen_override = pricing["margen_override"]
    article.pvp_sin_iva = pricing["pvp_sin_iva"]
    article.pvp_con_iva = pricing["pvp_con_iva"]
    return article


@router.get("", response_model=List[ArticleResponse])
def list_articles(document_id: int, db: Session = Depends(get_db)):
    """List all articles for a document."""
    articles = (
        db.query(Article)
        .filter(Article.document_id == document_id)
        .order_by(Article.line_number)
        .all()
    )
    return articles


@router.post("", response_model=ArticleResponse)
def create_article(article_in: ArticleCreate, db: Session = Depends(get_db)):
    """Create a new article."""
    settings = get_settings(db)

    article = Article(
        document_id=article_in.document_id,
        line_number=article_in.line_number,
        descripcion=article_in.descripcion,
        cantidad=article_in.cantidad,
        precio_unitario_bruto=article_in.precio_unitario_bruto,
        descuento_1=article_in.descuento_1,
        descuento_2=article_in.descuento_2,
        descuento_3=article_in.descuento_3,
        descuento_4=article_in.descuento_4,
        iva_pct=article_in.iva_pct,
        recargo_pct=article_in.recargo_pct,
        margen_pct=article_in.margen_pct or 0,
        margen_override=article_in.margen_override,
        codigo_proveedor=article_in.codigo_proveedor,
        codigo_fabricante=article_in.codigo_fabricante,
        ean=article_in.ean,
        codigo_principal=article_in.codigo_principal,
        otros_codigos=json.dumps(article_in.otros_codigos) if article_in.otros_codigos else None,
        coste_neto_unitario=0,
        coste_neto_total=0,
        pvp_sin_iva=0,
        pvp_con_iva=0,
    )
    article = recalc_article(article, settings)
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.delete("/bulk")
def bulk_delete_articles(
    ids: List[int],
    db: Session = Depends(get_db),
):
    """Delete multiple articles at once."""
    if not ids:
        raise HTTPException(400, "No se proporcionaron IDs")
    if len(ids) > 200:
        raise HTTPException(400, "Máximo 200 artículos a la vez")
    deleted = db.query(Article).filter(Article.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": deleted}


@router.put("/bulk-margin")
def bulk_update_margin(
    ids: List[int],
    margen_pct: float,
    db: Session = Depends(get_db),
):
    """Set the same margin % on multiple articles."""
    if not ids:
        raise HTTPException(400, "No se proporcionaron IDs")
    if not (0 <= margen_pct <= 500):
        raise HTTPException(400, "El margen debe estar entre 0% y 500%")
    settings = get_settings(db)
    articles = db.query(Article).filter(Article.id.in_(ids)).all()
    for art in articles:
        art.margen_pct = margen_pct
        art.margen_override = True
        recalc_article(art, settings)
    db.commit()
    return {"ok": True, "updated": len(articles)}


@router.put("/{article_id}", response_model=ArticleResponse)
def update_article(
    article_id: int,
    update: ArticleUpdate,
    db: Session = Depends(get_db),
):
    """Update an article and recalculate pricing."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(404, "Article not found")

    settings = get_settings(db)

    update_data = update.model_dump(exclude_unset=True)

    # Validate numeric fields
    if "cantidad" in update_data and update_data["cantidad"] is not None:
        if update_data["cantidad"] <= 0:
            raise HTTPException(400, "La cantidad debe ser mayor que 0")
    if "precio_unitario_bruto" in update_data and update_data["precio_unitario_bruto"] is not None:
        if update_data["precio_unitario_bruto"] < 0:
            raise HTTPException(400, "El precio no puede ser negativo")
    for dto_field in ["descuento_1", "descuento_2", "descuento_3", "descuento_4"]:
        if dto_field in update_data and update_data[dto_field] is not None:
            if not (0 <= update_data[dto_field] <= 100):
                raise HTTPException(400, f"El descuento debe estar entre 0 y 100")
    if "iva_pct" in update_data and update_data["iva_pct"] is not None:
        if update_data["iva_pct"] not in (0, 4, 5, 10, 21):
            raise HTTPException(400, "IVA debe ser 0, 4, 5, 10 o 21")
    if "margen_pct" in update_data and update_data["margen_pct"] is not None:
        if not (0 <= update_data["margen_pct"] <= 500):
            raise HTTPException(400, "El margen debe estar entre 0% y 500%")

    # If margen_pct is explicitly set, mark as override
    if "margen_pct" in update_data and update_data["margen_pct"] is not None:
        update_data["margen_override"] = True

    # If margen_override is False, clear the margen_pct so it auto-calculates
    if update_data.get("margen_override") is False:
        update_data.pop("margen_pct", None)
        article.margen_override = False

    # Handle otros_codigos
    if "otros_codigos" in update_data:
        oc = update_data.pop("otros_codigos")
        article.otros_codigos = json.dumps(oc) if oc else None

    for field, value in update_data.items():
        setattr(article, field, value)

    article = recalc_article(article, settings)
    db.commit()
    db.refresh(article)
    return article


@router.delete("/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db)):
    """Delete an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(404, "Article not found")
    db.delete(article)
    db.commit()
    return {"ok": True}


@router.post("/recalculate")
def recalculate_document_articles(
    document_id: int,
    db: Session = Depends(get_db),
):
    """Recalculate margins and PVPs for all articles in a document."""
    settings = get_settings(db)
    articles = db.query(Article).filter(Article.document_id == document_id).all()

    for article in articles:
        recalc_article(article, settings)

    db.commit()
    return {"ok": True, "recalculated": len(articles)}
