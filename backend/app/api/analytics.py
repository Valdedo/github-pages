"""
Analytics endpoints: price history and supplier comparison.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/price-history")
def price_history(
    codigo: str = Query(..., description="Product code (EAN, codigo_principal, etc.)"),
    db: Session = Depends(get_db),
):
    """Price evolution for a product code across all documents."""
    rows = db.execute(text("""
        SELECT
            a.id           AS article_id,
            a.descripcion,
            a.codigo_principal,
            a.precio_unitario_bruto,
            a.coste_neto_unitario,
            a.pvp_con_iva,
            a.pvp_sin_iva,
            a.margen_pct,
            a.cantidad,
            d.id           AS document_id,
            d.supplier_name,
            d.doc_date,
            d.doc_number,
            d.created_at
        FROM articles a
        JOIN documents d ON a.document_id = d.id
        WHERE a.codigo_principal = :codigo
           OR a.ean              = :codigo
           OR a.codigo_fabricante = :codigo
           OR a.codigo_proveedor  = :codigo
        ORDER BY COALESCE(d.doc_date, DATE(d.created_at)) ASC, d.id ASC
    """), {"codigo": codigo}).fetchall()

    return [dict(r._mapping) for r in rows]


@router.get("/supplier-comparison")
def supplier_comparison(
    codigo: str = Query(..., description="Product code (EAN, codigo_principal, etc.)"),
    db: Session = Depends(get_db),
):
    """Compare the same product across different suppliers."""
    rows = db.execute(text("""
        SELECT
            d.supplier_name,
            COUNT(*)                             AS num_compras,
            MIN(a.coste_neto_unitario)           AS coste_min,
            MAX(a.coste_neto_unitario)           AS coste_max,
            AVG(a.coste_neto_unitario)           AS coste_avg,
            MIN(a.pvp_con_iva)                   AS pvp_min,
            MAX(a.pvp_con_iva)                   AS pvp_max,
            AVG(a.pvp_con_iva)                   AS pvp_avg,
            MAX(COALESCE(d.doc_date, DATE(d.created_at))) AS ultima_compra,
            MAX(a.descripcion) AS descripcion
        FROM articles a
        JOIN documents d ON a.document_id = d.id
        WHERE a.codigo_principal = :codigo
           OR a.ean              = :codigo
           OR a.codigo_fabricante = :codigo
           OR a.codigo_proveedor  = :codigo
        GROUP BY d.supplier_name
        ORDER BY coste_avg ASC
    """), {"codigo": codigo}).fetchall()

    return [dict(r._mapping) for r in rows]


@router.get("/top-products")
def top_products(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Most frequently purchased products across all documents."""
    rows = db.execute(text("""
        SELECT
            a.codigo_principal,
            MAX(a.descripcion)                   AS descripcion,
            COUNT(DISTINCT a.document_id)        AS num_documentos,
            COUNT(*)                             AS num_lineas,
            ROUND(AVG(a.coste_neto_unitario), 4) AS coste_avg,
            ROUND(AVG(a.pvp_con_iva), 2)         AS pvp_avg,
            COUNT(DISTINCT d.supplier_name)      AS num_proveedores
        FROM articles a
        JOIN documents d ON a.document_id = d.id
        WHERE a.codigo_principal IS NOT NULL
          AND a.codigo_principal NOT LIKE 'ART-%%'
        GROUP BY a.codigo_principal
        ORDER BY num_documentos DESC, num_lineas DESC
        LIMIT :lim
    """), {"lim": limit}).fetchall()

    return [dict(r._mapping) for r in rows]
