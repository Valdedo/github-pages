"""
App settings and supplier management endpoints.
"""
import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.app_settings import AppSettings
from app.models.supplier import Supplier
from app.schemas.settings import (
    AppSettingsResponse, AppSettingsUpdate,
    SupplierCreate, SupplierUpdate, SupplierResponse,
    MarginTier,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_or_create_settings(db: Session) -> AppSettings:
    s = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not s:
        s = AppSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def settings_to_response(s: AppSettings) -> AppSettingsResponse:
    tiers_raw = s.margin_tiers
    tiers = json.loads(tiers_raw) if isinstance(tiers_raw, str) else tiers_raw
    return AppSettingsResponse(
        id=s.id,
        margin_tiers=[MarginTier(**t) for t in tiers],
        rounding_mode=s.rounding_mode,
        rounding_decimals=s.rounding_decimals,
        label_columns=s.label_columns,
        label_rows_per_page=s.label_rows_per_page,
        base_url=s.base_url,
        updated_at=s.updated_at,
    )


@router.get("", response_model=AppSettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    """Get application settings."""
    s = get_or_create_settings(db)
    return settings_to_response(s)


@router.put("", response_model=AppSettingsResponse)
def update_settings(update: AppSettingsUpdate, db: Session = Depends(get_db)):
    """Update application settings."""
    s = get_or_create_settings(db)

    if update.margin_tiers is not None:
        s.margin_tiers = json.dumps([t.model_dump() for t in update.margin_tiers])
    if update.rounding_mode is not None:
        if update.rounding_mode not in ("standard", "psychological"):
            raise HTTPException(400, "rounding_mode must be 'standard' or 'psychological'")
        s.rounding_mode = update.rounding_mode
    if update.rounding_decimals is not None:
        s.rounding_decimals = max(0, min(4, update.rounding_decimals))
    if update.label_columns is not None:
        s.label_columns = max(1, min(4, update.label_columns))
    if update.label_rows_per_page is not None:
        s.label_rows_per_page = max(1, min(10, update.label_rows_per_page))
    if update.base_url is not None:
        s.base_url = update.base_url.rstrip("/")

    db.commit()
    db.refresh(s)
    return settings_to_response(s)


# --- Suppliers ---

@router.get("/suppliers", response_model=List[SupplierResponse])
def list_suppliers(db: Session = Depends(get_db)):
    suppliers = db.query(Supplier).all()
    result = []
    for s in suppliers:
        result.append(SupplierResponse(
            id=s.id,
            name=s.name,
            detection_keywords=json.loads(s.detection_keywords) if isinstance(s.detection_keywords, str) else s.detection_keywords,
            template_config=json.loads(s.template_config) if isinstance(s.template_config, str) else s.template_config,
            created_at=s.created_at,
        ))
    return result


@router.post("/suppliers", response_model=SupplierResponse)
def create_supplier(supplier_in: SupplierCreate, db: Session = Depends(get_db)):
    existing = db.query(Supplier).filter(Supplier.name == supplier_in.name).first()
    if existing:
        raise HTTPException(400, f"Supplier '{supplier_in.name}' already exists")

    supplier = Supplier(
        name=supplier_in.name,
        detection_keywords=json.dumps(supplier_in.detection_keywords),
        template_config=json.dumps(supplier_in.template_config),
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return SupplierResponse(
        id=supplier.id,
        name=supplier.name,
        detection_keywords=supplier_in.detection_keywords,
        template_config=supplier_in.template_config,
        created_at=supplier.created_at,
    )


@router.put("/suppliers/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    update: SupplierUpdate,
    db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    if update.name is not None:
        supplier.name = update.name
    if update.detection_keywords is not None:
        supplier.detection_keywords = json.dumps(update.detection_keywords)
    if update.template_config is not None:
        supplier.template_config = json.dumps(update.template_config)

    db.commit()
    db.refresh(supplier)
    return SupplierResponse(
        id=supplier.id,
        name=supplier.name,
        detection_keywords=json.loads(supplier.detection_keywords),
        template_config=json.loads(supplier.template_config),
        created_at=supplier.created_at,
    )


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    db.delete(supplier)
    db.commit()
    return {"ok": True}
