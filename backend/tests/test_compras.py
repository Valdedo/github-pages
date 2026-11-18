"""«Recibir mercancía» (nov. 2026): proveedor, compra anterior, precio fijo, cuadre y etiquetas de balda."""
import asyncio
import datetime as dt

from app.models.app_settings import AppSettings
from app.models.article import Article
from app.models.document import Document
from app.services import compras_service as cs
from app.services import extraction_service as ex


def _doc(db, prov, fecha, lineas, numero="1"):
    d = Document(filename="x.pdf", original_filename="x.pdf", file_path="/tmp/x.pdf", doc_type="pdf",
                 status="completed", supplier_name=prov, doc_number=numero, doc_date=fecha)
    db.add(d)
    db.flush()
    for i, l in enumerate(lineas):
        db.add(Article(document_id=d.id, line_number=i + 1, descripcion=l["d"], cantidad=l.get("q", 1),
                       precio_unitario_bruto=l["c"], coste_neto_unitario=l["c"], coste_neto_total=l["c"],
                       iva_pct=21, margen_pct=30, pvp_sin_iva=round(l["c"] * 1.3, 4),
                       pvp_con_iva=l.get("pvp", round(l["c"] * 1.3 * 1.21, 2)), pvp_fijo=l.get("fijo"),
                       codigo_proveedor=l.get("cod"), codigo_principal=l.get("cod") or f"ART-{d.id}-{i + 1}",
                       ean=l.get("ean")))
    db.commit()
    db.refresh(d)
    return d


class TestProveedor:
    def test_casa_fonso_nunca_es_proveedor(self):
        for n in ("FERNANDEZ FERNANDEZ, MANUEL - CASA FONSO", "Manuel Fernández Fernández", "CASA FONSO",
                  "MANUEL FERNANDEZ FDEZ.", "Casa Fonso (Manuel Fernández)", "NIF 10770071-E"):
            assert cs.es_propio(n), n
        for n in ("GENEBRE, S.A.", "Manuel Fernández Pérez S.L.", "Hierros y Aceros de Santander", None, ""):
            assert not cs.es_propio(n), n

    def test_un_proveedor_un_nombre(self, db):
        # Las tres formas en que salió Caminoval en la carpeta de Drive
        _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", dt.date(2026, 10, 29), [{"d": "Disco", "c": 2}])
        _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", dt.date(2026, 11, 5), [{"d": "Disco", "c": 2}])
        lista = cs.conocidos(db)
        assert lista == ["EFECTOS INDUSTRIALES CAMINOVAL"]
        assert cs.unificar("CAMINOVAL, S.L.", lista) == "EFECTOS INDUSTRIALES CAMINOVAL"
        assert cs.unificar("EFECTOS INDUS. CAMINOVAL S.L.", lista) == "EFECTOS INDUSTRIALES CAMINOVAL"
        assert cs.unificar("GENEBRE, S.A.", lista) == "GENEBRE, S.A."

    def test_resolver_y_aprender(self, db):
        _doc(db, "GENEBRE, S.A.", dt.date(2026, 10, 1), [{"d": "Grifo", "c": 30}])
        # La lectura trae al cliente: se queda con el que ya tenía o con ninguno, nunca con Casa Fonso
        assert cs.resolver_proveedor(db, "FERNANDEZ FERNANDEZ, MANUEL - CASA FONSO") is None
        assert cs.resolver_proveedor(db, "CASA FONSO", "Genebre") == "GENEBRE, S.A."
        # La tienda corrige «AD Grupo Regueira» → «Regueira»; la siguiente lectura ya sale corregida
        cs.aprender(db, "AD Grupo Regueira, S.A.U.", "Regueira (recambios)")
        db.commit()
        assert cs.resolver_proveedor(db, "AD GRUPO REGUEIRA S.A.U") == "Regueira (recambios)"

    def test_corregir_en_el_albaran_aprende(self, client, db):
        d = _doc(db, "WOLF GROUP IBERICO S.A.U", dt.date(2026, 11, 11), [{"d": "Espuma", "c": 3}])
        d.supplier_leido = "WOLF GROUP IBERICO S.A.U"
        db.commit()
        assert client.put(f"/api/documents/{d.id}", json={"supplier_name": "Casa Fonso"}).status_code == 422
        assert client.put(f"/api/documents/{d.id}", json={"supplier_name": "Penosil (Wolf)"}).status_code == 200
        assert cs.resolver_proveedor(db, "Wolf Group Ibérico, S.A.U.") == "Penosil (Wolf)"


class TestCompraAnterior:
    def test_nuevo_igual_sube_baja(self, client, db):
        _doc(db, "CAMINOVAL, S.L.", dt.date(2026, 10, 1), [
            {"d": "BROCA SDS-PLUS 8*165", "c": 4.90, "cod": "0712.001050", "pvp": 7.75},
            {"d": "DISCO DIAMANTE 115", "c": 4.875, "cod": "0225.000065"},
            {"d": "SIKAFLEX-111 BLANCO", "c": 6.48, "cod": "0735.000093", "ean": "8425998014013"},
            {"d": "PUNTAS HIERRO 16X060", "c": 2.38},
        ])
        hoy = _doc(db, "EFECTOS INDUS. CAMINOVAL S.L.", dt.date(2026, 11, 5), [
            {"d": "BROCA SDS-PLUS REF.1891 8*165", "c": 4.90, "cod": "0712.001050"},      # mismo código → igual
            {"d": "DISCO DIAMANTE VULCAN 115", "c": 5.265, "cod": "0225-000065"},          # +8 %
            {"d": "SIKAFLEX 111", "c": 6.00, "ean": "8425998014013"},                      # por EAN → baja
            {"d": "Puntas hierro 16x060", "c": 2.38},                                      # sin código, por nombre
            {"d": "CUCHILLA CEPILLO 82 MM", "c": 5.84, "cod": "0712.000974"},              # nuevo
        ])
        r = client.get(f"/api/compras/{hoy.id}").json()
        estados = [l["estado"] for l in r["lineas"]]
        assert estados == ["igual", "sube", "baja", "igual", "nuevo"]
        assert r["lineas"][1]["pct"] == 8.0 and r["lineas"][1]["coste_anterior"] == 4.875
        assert r["lineas"][0]["pvp_anterior"] == 7.75 and r["lineas"][0]["pvp_cambia"]
        assert r["resumen"]["sube"] == 1 and r["resumen"]["nuevo"] == 1 and r["resumen"]["total"] == 5
        assert r["lineas"][2]["historial"][0]["fecha"] == "2026-10-01"

    def test_no_compara_con_compras_posteriores(self, client, db):
        viejo = _doc(db, "GENEBRE, S.A.", dt.date(2026, 9, 1), [{"d": "GEFLEX DN13", "c": 3.0, "cod": "H1301"}])
        _doc(db, "GENEBRE, S.A.", dt.date(2026, 11, 4), [{"d": "GEFLEX DN13", "c": 3.5, "cod": "H1301"}])
        assert client.get(f"/api/compras/{viejo.id}").json()["lineas"][0]["estado"] == "nuevo"

    def test_hereda_codigo_de_barras_y_precio_de_la_tienda(self, db):
        db.add(AppSettings(id=1))
        _doc(db, "GARHE, S.A.", dt.date(2026, 10, 1), [
            {"d": "BOLSAS VACIO 16x25", "c": 4.25, "cod": "31111", "ean": "8425998014013", "pvp": 7.50, "fijo": 7.50},
            {"d": "BOLSAS VACIO 20x25", "c": 5.975, "cod": "31112", "pvp": 9.90, "fijo": 9.90},
        ])
        hoy = _doc(db, "GARHE S.A.", dt.date(2026, 11, 5), [
            {"d": "PAQUETE 100 BOLSAS VACIO 16x25 cm", "c": 4.25, "cod": "31111"},   # mismo coste
            {"d": "PAQUETE 100 BOLSAS VACIO 20x25 cm", "c": 6.50, "cod": "31112"},   # sube: el precio no se hereda solo
        ])
        assert cs.heredar(db, hoy, db.get(AppSettings, 1)) == 1
        a, b = hoy.articles
        assert a.ean == "8425998014013" and a.pvp_fijo == 7.50 and a.pvp_con_iva == 7.50
        assert b.pvp_fijo is None and b.pvp_con_iva != 9.90


class TestPrecioFijo:
    def test_precio_a_mano_exacto_y_se_quita(self, client, db):
        db.add(AppSettings(id=1))
        d = _doc(db, "X", dt.date(2026, 11, 1), [{"d": "Tapón", "c": 2.0}])
        a = d.articles[0]
        # 4,32 € no es múltiplo de 0,05: con el redondeo «hacia arriba» antes se iba a 4,35
        r = client.put(f"/api/articles/{a.id}", json={"pvp_fijo": 4.32}).json()
        assert r["pvp_con_iva"] == 4.32 and r["pvp_fijo"] == 4.32 and r["margen_override"]
        assert abs(r["pvp_sin_iva"] * 1.21 - 4.32) < 0.001
        # cambiar otra cosa no lo mueve
        assert client.put(f"/api/articles/{a.id}", json={"cantidad": 5}).json()["pvp_con_iva"] == 4.32
        # quitarlo vuelve al calculado
        r = client.put(f"/api/articles/{a.id}", json={"pvp_fijo": None}).json()
        assert r["pvp_fijo"] is None and r["pvp_con_iva"] != 4.32 and not r["margen_override"]
        assert client.put(f"/api/articles/{a.id}", json={"pvp_fijo": 0}).status_code == 422


class TestLectura:
    def test_cuadre_en_codigo(self):
        arts = [{"cantidad": 6, "precio_unitario_bruto": 8.34, "descuento_1": 30, "coste_neto_unitario": None}]
        assert ex.cuadre(arts, {"base_imponible": 35.03})["ok"]            # albarán Caminoval 0.489293
        mal = [{"cantidad": 6, "precio_unitario_bruto": 0.34, "descuento_1": 30, "coste_neto_unitario": None}]
        c = ex.cuadre(mal, {"base_imponible": 35.03})                       # «,34» del texto del escáner
        assert not c["ok"] and c["dif"] < -30
        assert ex.cuadre(arts, {}) is None                                   # albarán sin valorar: no se opina
        con_portes = [{"cantidad": 1, "coste_neto_unitario": 90.0}]
        assert ex.cuadre(con_portes, {"base_imponible": 100.0, "portes": 10.0})["ok"]

    def test_relee_si_no_cuadra_y_se_queda_con_la_buena(self, monkeypatch):
        llamadas = []

        async def falsa(imagenes, plantilla=None, texto_apoyo="", aviso=""):
            llamadas.append(aviso)
            precio = 8.34 if aviso else 0.34
            return {"documento": {"proveedor": "CAMINOVAL, S.L."},
                    "articulos": [{"descripcion": "CUCHILLA", "cantidad": 6, "precio_unitario_bruto": precio, "descuento_1": 30}],
                    "totales_documento": {"base_imponible": 35.03}, "validacion": {"cuadra": True}}

        monkeypatch.setattr(ex, "extract_with_claude_vision", falsa)
        out = asyncio.run(ex._leer_imagenes(["p1"], None, "texto del escáner"))
        assert len(llamadas) == 2 and "35.03" in llamadas[1]
        assert out["articulos"][0]["precio_unitario_bruto"] == 8.34
        assert out["validacion"]["cuadra"] is True and out["releido"]

    def test_el_aviso_de_la_ia_no_manda(self, monkeypatch):
        async def falsa(imagenes, plantilla=None, texto_apoyo="", aviso=""):
            return {"documento": {}, "articulos": [{"descripcion": "X", "cantidad": 1, "precio_unitario_bruto": 1}],
                    "totales_documento": {"base_imponible": 50}, "validacion": {"cuadra": True}}
        monkeypatch.setattr(ex, "extract_with_claude_vision", falsa)
        out = asyncio.run(ex._leer_imagenes(["p1"], None))
        assert out["validacion"]["cuadra"] is False     # la IA decía que cuadraba; las cuentas dicen que no

    def test_el_prompt_lleva_cliente_y_proveedores(self):
        assert "10770071E" in ex.EXTRACTION_SYSTEM_PROMPT and "NUNCA lo pongas como proveedor" in ex.EXTRACTION_SYSTEM_PROMPT
        ex.poner_conocidos(["GENEBRE, S.A.", "GARHE, S.A."])
        try:
            assert "GENEBRE, S.A. · GARHE, S.A." in ex.build_extraction_prompt({"full_text": "x"})
        finally:
            ex.poner_conocidos([])


class TestEtiquetasBalda:
    def test_pdf_y_posicion(self, client, db):
        from app.services import label_service as ls
        # 2 × 97 + 2 × 8 = 210 y 6 × 42,3 + 2 × 21,6 = 297: la plantilla llena el A4 exacto
        assert abs(ls.BALDA["cols"] * ls.BALDA["ancho"] + 2 * ls.BALDA["izq"] - 210) < 0.01
        assert abs(ls.BALDA["filas"] * ls.BALDA["alto"] + 2 * ls.BALDA["arriba"] - 297) < 0.01
        x0, y0 = ls._balda_pos(0, 0, 0)
        assert abs(x0 - ls.mm_to_points(8)) < 0.01 and abs(y0 - ls.mm_to_points(297 - 21.6 - 42.3)) < 0.01
        x11, y11 = ls._balda_pos(11, 1.5, -2)
        assert abs(x11 - ls.mm_to_points(8 + 97 + 1.5)) < 0.01 and abs(y11 - ls.mm_to_points(21.6 + 2)) < 0.01

        d = _doc(db, "X", dt.date(2026, 11, 1), [{"d": f"Artículo {i}", "c": 2.0 + i, "ean": "8425998014013"} for i in range(14)])
        ids = ",".join(str(a.id) for a in d.articles)
        r = client.get(f"/api/compras/etiquetas?ids={ids}&inicio=11")
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        import pdfplumber, io
        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            assert len(pdf.pages) == 2          # 2 en el folio empezado + 12 en el siguiente
            assert "Artículo 0" in pdf.pages[0].extract_text() and "Artículo 13" in pdf.pages[1].extract_text()
        assert client.get("/api/compras/etiquetas/prueba").content[:4] == b"%PDF"
        assert client.get("/api/compras/etiquetas?ids=").status_code == 422


class TestVariosALaVez:
    """Subir un montón de albaranes: nada se pisa en Drive y las hojas sueltas se juntan."""

    def test_el_segundo_con_el_mismo_nombre_no_pisa_al_primero(self, db):
        from app.services import drive_proveedor as dp
        f = dt.date(2026, 11, 9)
        a = _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", f, [{"d": "Disco", "c": 2}], numero="0489278")
        b = _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", f, [{"d": "Broca", "c": 3}], numero="0489278")
        c = _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", f, [{"d": "Llave", "c": 4}], numero="0489279")
        assert dp.nombre_sin_pisar(db, a) == "2026-11-09_EFECTOS INDUSTRIALES CAMINOVAL_Albarán 0489278.pdf"
        assert dp.nombre_sin_pisar(db, b) == "2026-11-09_EFECTOS INDUSTRIALES CAMINOVAL_Albarán 0489278 (2).pdf"
        assert dp.nombre_sin_pisar(db, c).endswith("Albarán 0489279.pdf")
        assert dp.nombre_sin_pisar(db, a) == dp.nombre_archivo(a)  # volver a guardarlo no le cambia el nombre

    def test_el_que_no_se_leyo_se_guarda_como_sin_leer(self, db):
        from app.services import drive_proveedor as dp
        d = Document(filename="x.pdf", original_filename="CCF_000313.pdf", file_path="/tmp/x.pdf", doc_type="pdf",
                     status="error")
        db.add(d)
        db.commit()
        assert dp.nombre_sin_pisar(db, d).endswith(f"_Sin leer_CCF_000313 ({d.id}).pdf")

    def test_mismo_numero_escrito_distinto_son_gemelos(self, db):
        from app.api.documents import _gemelos
        f = dt.date(2026, 11, 9)
        a = _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", f, [{"d": "Disco", "c": 2}], numero="0.489278")
        b = _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", f, [{"d": "Broca", "c": 3}], numero="0489278")
        otro_dia = _doc(db, "EFECTOS INDUSTRIALES CAMINOVAL", dt.date(2025, 1, 2), [{"d": "X", "c": 1}], numero="489278")
        otro_prov = _doc(db, "GENEBRE, S.A.", f, [{"d": "X", "c": 1}], numero="0489278")
        g = _gemelos([a, b, otro_dia, otro_prov])
        assert g == {a.id: b.id, b.id: a.id}
        b.distinto_ok = True  # la tienda dijo que son distintos: no se vuelve a preguntar
        assert _gemelos([a, b]) == {}

    def test_juntar_dos_hojas_deja_un_albaran_con_las_dos(self, db, tmp_path, monkeypatch):
        from fastapi import BackgroundTasks
        from pypdf import PdfReader, PdfWriter
        from app.api import documents as api
        from app.config import settings
        monkeypatch.setattr(settings, "upload_dir", str(tmp_path))

        def hoja(nombre, paginas):
            w = PdfWriter()
            for _ in range(paginas):
                w.add_blank_page(width=595, height=842)
            ruta = tmp_path / nombre
            with open(ruta, "wb") as fh:
                w.write(fh)
            return str(ruta)

        f = dt.date(2026, 11, 9)
        # se subió primero la hoja 2 (pasa cuando se arrastran todas a la vez)
        b = _doc(db, "CAMINOVAL", f, [{"d": "Broca", "c": 3}], numero="0489278")
        a = _doc(db, "CAMINOVAL", f, [{"d": "Disco", "c": 2}], numero="0.489278")
        b.original_filename, b.file_path = "CCF_000314.pdf", hoja("h2.pdf", 1)
        a.original_filename, a.file_path = "CCF_000313.pdf", hoja("h1.pdf", 2)
        db.commit()
        ids = (a.id, b.id)
        tareas = BackgroundTasks()
        res = asyncio.run(api.juntar(a.id, api.Juntar(con=b.id), tareas, db))
        assert res.id == min(ids) and db.query(Document).count() == 1
        assert res.original_filename == "CCF_000313.pdf + CCF_000314.pdf"  # en el orden del escáner
        assert len(PdfReader(res.file_path).pages) == 3
        assert res.status == "uploaded" and db.query(Article).count() == 0  # se vuelve a leer entero
        assert len(tareas.tasks) == 1
        assert not (tmp_path / "h1.pdf").exists() and not (tmp_path / "h2.pdf").exists()


class TestModeloDeLectura:
    """La lectura usa el modelo nuevo y, si la clave no lo tiene, vuelve sola al de siempre."""

    def _cliente(self, falla_con=None):
        import anthropic, httpx

        class Mensajes:
            def __init__(self): self.pedidos = []
            async def create(self, **k):
                self.pedidos.append(k["model"])
                if k["model"] == falla_con:
                    r = httpx.Response(404, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
                    raise anthropic.NotFoundError("model: no existe", response=r, body=None)
                return type("M", (), {"stop_reason": "end_turn", "content": [type("B", (), {"text": ' {"ok": 1} '})()]})()

        return type("C", (), {"messages": Mensajes()})()

    def test_usa_el_modelo_de_lectura(self, monkeypatch):
        monkeypatch.setattr(ex, "_sin_modelo_nuevo_hasta", 0.0)
        c = self._cliente()

        async def leer():
            texto = await ex._pedir(c, "hola")
            return texto, ex.modelo_usado()
        texto, usado = asyncio.run(leer())
        assert texto == '{"ok": 1}' and c.messages.pedidos == [ex.settings.claude_model_lectura] == [usado]

    def test_si_la_clave_no_lo_tiene_lee_con_el_de_siempre(self, monkeypatch):
        monkeypatch.setattr(ex, "_sin_modelo_nuevo_hasta", 0.0)
        nuevo, viejo = ex.settings.claude_model_lectura, ex.settings.claude_model
        assert nuevo != viejo
        c = self._cliente(falla_con=nuevo)

        async def leer():
            await ex._pedir(c, "hola")
            uno = ex.modelo_usado()
            await ex._pedir(c, "otra")     # ya no insiste con el nuevo durante una hora
            return uno
        assert asyncio.run(leer()) == viejo
        assert c.messages.pedidos == [nuevo, viejo, viejo]

    def test_la_imagen_va_a_la_resolucion_que_ve_el_modelo(self):
        import base64, io
        from PIL import Image
        b = ex._image_to_base64_block(Image.new("RGB", (3000, 4200), "white"))
        im = Image.open(io.BytesIO(base64.b64decode(b["source"]["data"])))
        assert max(im.size) == ex.LADO_MAX == 2576
        chica = ex._image_to_base64_block(Image.new("RGB", (1819, 2573), "white"))   # un A4 a 220 ppp: no se toca
        assert Image.open(io.BytesIO(base64.b64decode(chica["source"]["data"]))).size == (1819, 2573)
