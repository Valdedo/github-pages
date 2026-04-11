"""
Product information endpoints.
Used for QR code landing pages and product spec management.
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import HTMLResponse
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


@router.get("/scan/{code}")
def scan_product(code: str, db: Session = Depends(get_db)):
    """Look up a product by EAN or codigo_principal for the POS scanner."""
    article = (
        db.query(Article)
        .filter((Article.ean == code) | (Article.codigo_principal == code))
        .order_by(Article.updated_at.desc())
        .first()
    )
    if not article:
        raise HTTPException(404, "Producto no encontrado")
    return {
        "id": article.id,
        "descripcion": article.descripcion,
        "pvp_con_iva": article.pvp_con_iva,
        "pvp_sin_iva": article.pvp_sin_iva,
        "iva_pct": article.iva_pct,
        "codigo_principal": article.codigo_principal,
        "ean": article.ean,
    }


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


@router.get("/ficha/{code}", response_class=HTMLResponse)
def product_sheet(
    code: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Public HTML product sheet — linked from QR codes on labels."""
    from app.models.app_settings import AppSettings

    # Find article by codigo_principal or EAN
    article = (
        db.query(Article)
        .filter((Article.codigo_principal == code) | (Article.ean == code))
        .order_by(Article.id.desc())
        .first()
    )

    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    company = (settings.company_name if settings and settings.company_name else "").strip() or "Casa Fonso"

    if not article:
        html = f"""<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Producto no encontrado — {company}</title>
        <style>
          *{{box-sizing:border-box;margin:0;padding:0}}
          body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0fdf4;color:#555;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px}}
          .icon{{font-size:48px;margin-bottom:16px}}
          h2{{color:#15803d;font-size:20px;margin-bottom:8px}}
          p{{font-size:14px;color:#888}}
        </style>
        </head><body>
          <div class="icon">📦</div>
          <h2>Producto no encontrado</h2>
          <p>Código: {code}</p>
        </body></html>"""
        return HTMLResponse(content=html, status_code=404)

    # Auto-create / auto-trigger web search if not done yet
    if not article.product_info_id:
        codigo = article.codigo_principal or code
        pi_existing = db.query(ProductInfo).filter(ProductInfo.codigo_principal == codigo).first()
        if not pi_existing:
            pi_existing = ProductInfo(
                codigo_principal=codigo,
                descripcion=article.descripcion,
                search_attempted=False,
            )
            db.add(pi_existing)
            db.commit()
            db.refresh(pi_existing)
            article.product_info_id = pi_existing.id
            db.commit()
        if not pi_existing.search_attempted:
            background_tasks.add_task(
                _search_product_bg, pi_existing.id, codigo, article.descripcion
            )

    pvp = f"{article.pvp_con_iva:.2f}".replace(".", ",") + " €" if article.pvp_con_iva else "—"
    ean_row = f"<tr><td>EAN</td><td>{article.ean}</td></tr>" if article.ean else ""
    cod_fab = f"<tr><td>Cód. Fabricante</td><td>{article.codigo_fabricante}</td></tr>" if article.codigo_fabricante else ""
    iva_row = f"<tr><td>IVA</td><td>{article.iva_pct:.0f} %</td></tr>" if article.iva_pct is not None else ""

    # Specs and AI description from ProductInfo if linked
    specs_html = ""
    ficha_html = ""
    pending_search = False
    pi_id_for_poll = None
    if article.product_info_id:
        pi = db.query(ProductInfo).filter(ProductInfo.id == article.product_info_id).first()
        if pi:
            if pi.ficha_ia:
                ficha_html = f'<div class="card"><h3>Descripción</h3><p class="ficha-text">{pi.ficha_ia}</p></div>'
            if pi.specs:
                try:
                    specs = json.loads(pi.specs) if isinstance(pi.specs, str) else pi.specs
                    if specs:
                        rows = "".join(f"<tr><td>{k}</td><td>{v}</td></tr>" for k, v in specs.items())
                        specs_html = f'<div class="card"><h3>Especificaciones técnicas</h3><table class="t">{rows}</table></div>'
                except Exception:
                    pass
            if not pi.ficha_ia and not pi.specs and not pi.search_attempted:
                pending_search = True
                pi_id_for_poll = pi.id

    # JavaScript snippet to auto-reload once AI search completes
    poll_script = ""
    if pending_search and pi_id_for_poll:
        poll_script = f"""
<script>
(function() {{
  var piId = {pi_id_for_poll};
  var attempts = 0;
  var maxAttempts = 30;
  function poll() {{
    if (attempts >= maxAttempts) return;
    attempts++;
    fetch('/api/products/' + piId)
      .then(function(r) {{ return r.json(); }})
      .then(function(data) {{
        if (data.search_attempted) {{
          window.location.reload();
        }} else {{
          setTimeout(poll, 3000);
        }}
      }})
      .catch(function() {{ setTimeout(poll, 3000); }});
  }}
  setTimeout(poll, 3000);
}})();
</script>"""

    pending_banner = """
  <div class="card" id="search-banner" style="background:#f0fdf4;border:1px solid #bbf7d0;text-align:center;color:#15803d;font-size:13px;">
    <div style="font-size:22px;margin-bottom:6px">🔍</div>
    <strong>Buscando especificaciones técnicas…</strong><br>
    <span style="font-size:12px;opacity:.75">La página se actualizará automáticamente en unos segundos</span>
    <div style="margin-top:10px;height:4px;background:#bbf7d0;border-radius:99px;overflow:hidden">
      <div style="height:100%;background:#16a34a;border-radius:99px;animation:bar 1.6s ease-in-out infinite"></div>
    </div>
  </div>
  <style>
    @keyframes bar {{
      0%   {{ width:0%;margin-left:0 }}
      50%  {{ width:60%;margin-left:20% }}
      100% {{ width:0%;margin-left:100% }}
    }}
  </style>""" if pending_search else ""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{article.descripcion} — {company}</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0fdf4;color:#0f172a;min-height:100vh}}
    .header{{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;padding:20px 18px 24px}}
    .header .brand{{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin-bottom:6px}}
    .header h1{{font-size:18px;line-height:1.35;font-weight:700}}
    .body{{padding:0 12px 24px}}
    .card{{background:#fff;border-radius:14px;padding:18px;margin-top:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);border:1px solid #e2e8f0}}
    .price{{font-size:40px;font-weight:800;color:#16a34a;letter-spacing:-0.03em;line-height:1}}
    .price-label{{font-size:12px;color:#64748b;margin-top:4px;font-weight:500}}
    h3{{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px}}
    table.t{{width:100%;border-collapse:collapse}}
    table.t td{{padding:9px 4px;border-bottom:1px solid #f1f5f9;font-size:14px;vertical-align:top}}
    table.t tr:last-child td{{border-bottom:none}}
    table.t td:first-child{{color:#64748b;width:42%;font-weight:500;font-size:13px}}
    table.t td:last-child{{font-weight:600;color:#0f172a}}
    .ficha-text{{font-size:15px;line-height:1.65;color:#374151;margin:0}}
    .footer{{text-align:center;font-size:11px;color:#94a3b8;padding:20px 16px 32px}}
    .badge{{display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;
            padding:2px 8px;border-radius:99px;margin-bottom:10px}}
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">{company}</div>
    <h1>{article.descripcion}</h1>
  </div>

  <div class="body">
    <div class="card">
      <div class="badge">Precio de venta al público</div>
      <div class="price">{pvp}</div>
      <div class="price-label">IVA incluido</div>
    </div>

    <div class="card">
      <h3>Referencia</h3>
      <table class="t">
        <tr><td>Código</td><td>{article.codigo_principal or "—"}</td></tr>
        {ean_row}
        {cod_fab}
        {iva_row}
      </table>
    </div>

    {ficha_html}
    {specs_html}
    {pending_banner}
  </div>

  <div class="footer">{company} · Ficha de producto</div>
{poll_script}
</body>
</html>"""
    return HTMLResponse(content=html)


@router.post("/decode-image")
async def decode_barcode_image(file: UploadFile = File(...)):
    """Decode barcode/QR from uploaded image. Uses pyzbar for EAN/Code128 + OpenCV for QR."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        raise HTTPException(500, "OpenCV not available")

    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "No se pudo leer la imagen")

    # Resize if too large (phone photos are 3000-4000px; 1200px is plenty)
    h, w = img.shape[:2]
    if max(h, w) > 1200:
        scale = 1200 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    def _try_pyzbar(image):
        try:
            from pyzbar.pyzbar import decode as pyzbar_decode
            barcodes = pyzbar_decode(image)
            codes = [b.data.decode("utf-8") for b in barcodes if b.data]
            return codes
        except Exception:
            return []

    def _try_qr_opencv(image):
        try:
            qr = cv2.QRCodeDetector()
            data, _, _ = qr.detectAndDecode(image)
            return [data] if data else []
        except Exception:
            return []

    # 1. Try pyzbar on colour image
    codes = _try_pyzbar(img)
    if codes:
        return {"code": codes[0], "all_codes": codes}

    # 2. Try grayscale + slight sharpening
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sharp = cv2.filter2D(gray, -1, np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]]))
    codes = _try_pyzbar(sharp)
    if codes:
        return {"code": codes[0], "all_codes": codes}

    # 3. Try adaptive threshold (helps with poor lighting)
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    codes = _try_pyzbar(thresh)
    if codes:
        return {"code": codes[0], "all_codes": codes}

    # 4. OpenCV QR fallback
    codes = _try_qr_opencv(img)
    if codes:
        return {"code": codes[0], "all_codes": codes}

    raise HTTPException(404, "No se detectó ningún código de barras. Acércate más al código y asegúrate de que esté bien iluminado.")


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
            specs.pop("_source_url", None)
            ficha_ia = specs.pop("_ficha_ia", None)
            product.specs = json.dumps(specs) if specs else None
            if ficha_ia:
                product.ficha_ia = ficha_ia
        product.search_attempted = True
        db.commit()

    except Exception as e:
        logger.error(f"Product search bg task failed: {e}")
    finally:
        db.close()
