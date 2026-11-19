"""Albaranes de proveedor en Drive: carpetas y elegir la de un proveedor."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.services import drive_proveedor as dp
from app.services import mail_service

router = APIRouter(prefix="/api/drive", tags=["drive"])


class Carpeta(BaseModel):
    folder_id: str


def _doc(db: Session, doc_id: int) -> Document:
    d = db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "Albarán no encontrado")
    return d


@router.get("/carpetas")
def get_carpetas(refrescar: bool = False):
    if not mail_service.configured():
        raise HTTPException(503, "Falta configurar la conexión con Google")
    try:
        return [c for c in dp.carpetas(refrescar) if not c["name"].startswith("_")]
    except Exception as e:
        raise HTTPException(502, f"No se pudieron leer las carpetas de Drive: {e}")


class CarpetaNueva(BaseModel):
    nombre: str


@router.get("/documento/{doc_id}/pendiente")
def pendiente(doc_id: int, db: Session = Depends(get_db)):
    """Lo que hace falta para colocar un albarán que está en «_Pendientes de clasificar»: la lista de carpetas
    recién leída de Drive, si la app puede crear una y con qué nombre. Si mientras tanto su proveedor ya tiene carpeta
    (se acaba de crear en Drive), lo mueve y lo dice."""
    d = _doc(db, doc_id)
    if not mail_service.configured():
        raise HTTPException(503, "Falta configurar la conexión con Google")
    try:
        lista = dp.carpetas(refrescar=True)
        dp.recolocar(db)
    except Exception as e:
        raise HTTPException(502, f"No se pudieron leer las carpetas de Drive: {e}")
    db.refresh(d)
    return {"carpetas": [c for c in lista if not c["name"].startswith("_")],
            "puede_crear": mail_service.drive_puede_crear(),
            "sugerido": dp.nombre_sugerido(d.supplier_name or ""),
            "drive_carpeta": d.drive_carpeta, "drive_pendiente": d.drive_pendiente}


@router.post("/documento/{doc_id}/carpeta-nueva")
def carpeta_nueva(doc_id: int, data: CarpetaNueva, db: Session = Depends(get_db)):
    """Crea en Drive la carpeta del proveedor y mueve a ella este albarán (y los demás suyos que estén pendientes)."""
    d = _doc(db, doc_id)
    if not d.drive_file_id:
        raise HTTPException(400, "Este albarán todavía no está en Drive")
    if not mail_service.drive_puede_crear():
        raise HTTPException(409, "La app todavía no puede crear carpetas en Drive: falta actualizar el script de Google. "
                                 "Mientras tanto, créala en Drive dentro de ALBARANES y pulsa «Actualizar la lista».")
    try:
        dp.crear_carpeta(db, d, data.nombre)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo crear la carpeta en Drive: {e}")
    db.refresh(d)
    return {"drive_carpeta": d.drive_carpeta, "drive_pendiente": d.drive_pendiente}


@router.post("/documento/{doc_id}/carpeta")
def elegir(doc_id: int, data: Carpeta, db: Session = Depends(get_db)):
    d = _doc(db, doc_id)
    if not d.drive_file_id:
        raise HTTPException(400, "Este albarán todavía no está en Drive")
    try:
        dp.elegir_carpeta(db, d, data.folder_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo mover en Drive: {e}")
    db.refresh(d)
    return {"drive_carpeta": d.drive_carpeta, "drive_pendiente": d.drive_pendiente}


@router.post("/documento/{doc_id}/guardar")
def reintentar(doc_id: int, db: Session = Depends(get_db)):
    d = _doc(db, doc_id)
    dp.guardar(d.id)
    db.refresh(d)
    return {"drive_carpeta": d.drive_carpeta, "drive_pendiente": d.drive_pendiente, "drive_error": d.drive_error,
            "drive_url": d.drive_url}
