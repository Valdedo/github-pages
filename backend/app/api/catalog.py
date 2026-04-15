"""
Catalog API: cross-document article master + price-change alerts.

The catalog is a view of all unique articles seen across completed documents.
For each unique code (or description when no code exists), the most recent
article version is returned.

Price alerts compare each article in a newly-processed document against the
last known cost from the same supplier, flagging increases above a threshold.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text

from app.database import get_db
from app.models.article import Article
from app.models.document import Document

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("")
def get_catalog(
    q: Optional[str] = Query(None, description="Search by description or code"),
    familia: Optional[str] = Query(None),
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db),
):
    """Return the product catalog: one entry per unique article code.

    For each unique codigo_principal (or descripcion when no code), the most
    recent article across all completed documents is returned, enriched with
    supplier and document metadata.
    """
    # Subquery: for each unique key, find the article with the latest document date
    # We use a raw query for performance / SQLite compatibility
    base_sql = """
        WITH ranked AS (
            SELECT
                a.id,
                a.descripcion,
                a.cantidad,
                a.coste_neto_unitario,
                a.pvp_sin_iva,
                a.pvp_con_iva,
                a.margen_pct,
                a.iva_pct,
                a.codigo_principal,
                a.codigo_proveedor,
                a.codigo_fabricante,
                a.ean,
                a.familia,
                a.document_id,
                d.supplier_name,
                d.doc_date,
                d.doc_number,
                ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(NULLIF(a.codigo_principal,''), a.descripcion)
                    ORDER BY d.doc_date DESC NULLS LAST, a.id DESC
                ) AS rn
            FROM articles a
            JOIN documents d ON d.id = a.document_id
            WHERE d.status = 'completed'
        )
        SELECT * FROM ranked WHERE rn = 1
    """
    filters = []
    params = {}

    if q:
        filters.append(
            "(LOWER(descripcion) LIKE :q OR LOWER(codigo_principal) LIKE :q "
            "OR LOWER(ean) LIKE :q OR LOWER(codigo_proveedor) LIKE :q)"
        )
        params["q"] = f"%{q.lower()}%"

    if familia:
        filters.append("(familia = :familia OR (familia IS NULL AND :familia = ''))")
        params["familia"] = familia

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    sql = f"SELECT * FROM ({base_sql}) WHERE rn = 1 {where_clause} ORDER BY descripcion LIMIT :limit"
    # Actually simpler: wrap the CTE result
    final_sql = f"""
        WITH ranked AS (
            SELECT
                a.id,
                a.descripcion,
                a.cantidad,
                a.coste_neto_unitario,
                a.pvp_sin_iva,
                a.pvp_con_iva,
                a.margen_pct,
                a.iva_pct,
                a.codigo_principal,
                a.codigo_proveedor,
                a.codigo_fabricante,
                a.ean,
                a.familia,
                a.document_id,
                d.supplier_name,
                d.doc_date,
                d.doc_number,
                ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(NULLIF(a.codigo_principal,''), a.descripcion)
                    ORDER BY d.doc_date DESC NULLS LAST, a.id DESC
                ) AS rn
            FROM articles a
            JOIN documents d ON d.id = a.document_id
            WHERE d.status = 'completed'
        )
        SELECT id, descripcion, cantidad, coste_neto_unitario, pvp_sin_iva, pvp_con_iva,
               margen_pct, iva_pct, codigo_principal, codigo_proveedor, codigo_fabricante,
               ean, familia, document_id, supplier_name, doc_date, doc_number
        FROM ranked
        WHERE rn = 1
        {f"AND (LOWER(descripcion) LIKE :q OR LOWER(codigo_principal) LIKE :q OR LOWER(ean) LIKE :q OR LOWER(codigo_proveedor) LIKE :q)" if q else ""}
        {f"AND familia = :familia" if familia else ""}
        ORDER BY descripcion
        LIMIT :limit
    """
    params["limit"] = limit

    with db.bind.connect() as conn:
        rows = conn.execute(text(final_sql), params).fetchall()

    result = []
    for row in rows:
        result.append({
            "id":                  row.id,
            "descripcion":         row.descripcion,
            "coste_neto_unitario": row.coste_neto_unitario,
            "pvp_sin_iva":         row.pvp_sin_iva,
            "pvp_con_iva":         row.pvp_con_iva,
            "margen_pct":          row.margen_pct,
            "iva_pct":             row.iva_pct,
            "codigo_principal":    row.codigo_principal,
            "codigo_proveedor":    row.codigo_proveedor,
            "codigo_fabricante":   row.codigo_fabricante,
            "ean":                 row.ean,
            "familia":             row.familia,
            "document_id":         row.document_id,
            "supplier_name":       row.supplier_name,
            "doc_date":            str(row.doc_date) if row.doc_date else None,
            "doc_number":          row.doc_number,
        })

    return result


@router.get("/families")
def get_families(db: Session = Depends(get_db)):
    """Return all distinct familia values used in the catalog."""
    rows = (
        db.query(Article.familia)
        .filter(Article.familia.isnot(None), Article.familia != "")
        .distinct()
        .order_by(Article.familia)
        .all()
    )
    return [r[0] for r in rows]


@router.get("/price-alerts/{document_id}")
def get_price_alerts(
    document_id: int,
    threshold_pct: float = Query(5.0, description="Minimum % increase to flag"),
    db: Session = Depends(get_db),
):
    """Compare this document's articles against the previous purchase from same supplier.

    Returns articles where cost increased above threshold_pct since the last time
    the same article (by codigo_principal) was bought from the same supplier.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return []

    current_articles = (
        db.query(Article)
        .filter(Article.document_id == document_id)
        .all()
    )

    alerts = []
    for art in current_articles:
        if not art.codigo_principal or art.coste_neto_unitario <= 0:
            continue

        # Find the most recent article with same code + same supplier, from a PREVIOUS document
        prev = (
            db.query(Article)
            .join(Document, Document.id == Article.document_id)
            .filter(
                Article.codigo_principal == art.codigo_principal,
                Article.document_id != document_id,
                Document.supplier_name == doc.supplier_name,
                Document.status == "completed",
                Article.coste_neto_unitario > 0,
            )
            .order_by(desc(Document.doc_date), desc(Article.id))
            .first()
        )

        if not prev:
            continue

        pct_change = (art.coste_neto_unitario - prev.coste_neto_unitario) / prev.coste_neto_unitario * 100

        if pct_change >= threshold_pct:
            alerts.append({
                "article_id":         art.id,
                "codigo_principal":   art.codigo_principal,
                "descripcion":        art.descripcion,
                "coste_anterior":     prev.coste_neto_unitario,
                "coste_actual":       art.coste_neto_unitario,
                "pvp_anterior":       prev.pvp_con_iva,
                "pvp_actual":         art.pvp_con_iva,
                "pct_cambio":         round(pct_change, 1),
                "prev_doc_id":        prev.document_id,
                "prev_doc_date":      str(prev.document.doc_date) if (prev.document and prev.document.doc_date) else None,
            })

    alerts.sort(key=lambda a: a["pct_cambio"], reverse=True)
    return alerts


@router.get("/export-treyfact")
def export_catalog_treyfact(
    familia: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Export the full catalog (or a filtered subset) as TreyFact-compatible Excel."""
    from fastapi.responses import Response
    from app.services.treyfact_service import generate_treyfact_excel

    # Count total matching articles before applying the 2000 limit
    total_matching = len(get_catalog(q=q, familia=familia, limit=999999, db=db))

    # Reuse catalog query logic to get articles
    catalog = get_catalog(q=q, familia=familia, limit=2000, db=db)

    # We need Article ORM objects for the service, so fetch by IDs
    ids = [row["id"] for row in catalog]
    if not ids:
        return Response(content=b"", status_code=204)

    articles = db.query(Article).filter(Article.id.in_(ids)).all()
    # Preserve catalog sort order (by descripcion)
    id_order = {aid: i for i, aid in enumerate(ids)}
    articles.sort(key=lambda a: id_order.get(a.id, 9999))

    excel_bytes = generate_treyfact_excel(articles, supplier_name="")
    resp_headers = {"Content-Disposition": 'attachment; filename="catalogo_treyfact.xlsx"'}
    if total_matching > 2000:
        resp_headers["X-Truncated-Count"] = str(total_matching)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=resp_headers,
    )


@router.get("/export-pricelist")
def export_catalog_pricelist(
    familia: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Export the full catalog as a PDF price list."""
    from fastapi.responses import Response
    from app.services.price_list_service import generate_price_list_pdf
    from app.models.app_settings import AppSettings

    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    company = settings.company_name if settings else ""

    # Count total matching articles before applying the 2000 limit
    total_matching = len(get_catalog(q=q, familia=familia, limit=999999, db=db))

    catalog = get_catalog(q=q, familia=familia, limit=2000, db=db)
    ids = [row["id"] for row in catalog]
    if not ids:
        return Response(content=b"", status_code=204)

    articles = db.query(Article).filter(Article.id.in_(ids)).all()
    id_order = {aid: i for i, aid in enumerate(ids)}
    articles.sort(key=lambda a: id_order.get(a.id, 9999))

    pdf_bytes = generate_price_list_pdf(
        articles=articles,
        company_name=company,
        title="Catálogo de Precios",
    )
    resp_headers = {"Content-Disposition": 'attachment; filename="catalogo_precios.pdf"'}
    if total_matching > 2000:
        resp_headers["X-Truncated-Count"] = str(total_matching)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers=resp_headers,
    )
