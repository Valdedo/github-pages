"""PDA del almacén: consultar precios y poner códigos de barras (datos inventados: el repo es público)."""
import datetime as dt

from app.models.article import Article
from app.models.tarifa import TarifaCopia
from app.services import pda_service as pda
from app.services import tarifas_service as ts
from tests.test_compras import _doc

EAN_A = "8410000000016"
EAN_B = "8410000000023"


def _tarifa(db, monkeypatch, arts):
    monkeypatch.setitem(ts.LECTORES, "gas", lambda hojas: {"articulos": arts})
    db.add(TarifaCopia(proveedor="gas", hojas="{}", leido_at=dt.datetime(2026, 11, 1)))
    db.commit()
    pda._idx["clave"] = None


class TestPrecio:
    def test_por_codigo_de_barras_sale_la_ultima_compra(self, db):
        _doc(db, "PROVEEDOR UNO", dt.date(2026, 9, 1), [{"d": "Disco 115", "c": 2.0, "cod": "D115", "ean": EAN_A, "pvp": 4.0}])
        _doc(db, "PROVEEDOR UNO", dt.date(2026, 11, 1), [{"d": "Disco 115", "c": 2.5, "cod": "D115", "ean": EAN_A, "pvp": 4.9}], "2")
        r = pda.buscar(db, EAN_A)
        assert len(r["items"]) == 1
        it = r["items"][0]
        assert it["pvp_iva"] == 4.9 and it["compras"] == 2 and it["fecha"] == "2026-11-01" and it["origen"] == "albaran"

    def test_upc_de_12_cifras_es_el_ean_con_un_cero(self, db):
        _doc(db, "PROVEEDOR UNO", dt.date(2026, 11, 1), [{"d": "Llave", "c": 3, "ean": "0036000291452"}])
        assert pda.buscar(db, "036000291452")["items"][0]["nombre"] == "Llave"

    def test_por_codigo_y_por_nombre(self, db):
        _doc(db, "PROVEEDOR UNO", dt.date(2026, 11, 1), [{"d": "BROCA SDS PLUS 8X160", "c": 3, "cod": "BR-8160"},
                                                         {"d": "BROCA SDS PLUS 10X160", "c": 4, "cod": "BR-10160"}])
        assert [i["codigo"] for i in pda.buscar(db, "br-8160")["items"]] == ["BR-8160"]
        assert len(pda.buscar(db, "broca sds")["items"]) == 2
        assert pda.buscar(db, "tornillo")["items"] == []
        assert pda.buscar(db, "x")["items"] == []

    def test_los_codigos_inventados_no_se_ensenan(self, db):
        _doc(db, "PROVEEDOR UNO", dt.date(2026, 11, 1), [{"d": "Arena fina", "c": 3}])
        assert "codigo" not in pda.buscar(db, "arena fina")["items"][0]

    def test_tambien_mira_las_tarifas(self, db, monkeypatch):
        _tarifa(db, monkeypatch, [
            {"ref": "C12", "codigo": "C12", "ean": EAN_B, "descripcion": "CODO LATON 1/2", "nombre": "Codo latón", "medida_c": "½″",
             "pvp": 2.0, "pvp_iva": 2.45, "coste": 1.2, "unidad": "ud", "ud_venta": "ud", "fecha": "2026-08"},
            {"ref": "B13", "descripcion": "Butano 12,5 kg", "pvp": None, "pvp_iva": 19.5, "coste": None, "solo_pvp": True,
             "unidad": "ud", "ud_venta": "ud", "fecha": None},
        ])
        it = pda.buscar(db, EAN_B)["items"][0]
        assert it["origen"] == "tarifa" and it["pvp_iva"] == 2.45 and it["nombre"] == "Codo latón ½″"
        assert pda.buscar(db, "c12")["items"][0]["codigo"] == "C12"
        assert pda.buscar(db, "butano")["items"][0]["pvp_iva"] == 19.5
        assert "_n" not in it and "coste" not in pda.buscar(db, "butano")["items"][0]


class TestCodigos:
    def test_lista_y_poner_codigo(self, db):
        d = _doc(db, "PROVEEDOR UNO", dt.date(2026, 11, 1), [{"d": "Disco", "c": 2}, {"d": "Llave", "c": 3, "ean": EAN_A}])
        assert pda.albaranes(db) == [{"id": d.id, "proveedor": "PROVEEDOR UNO", "numero": "1", "fecha": "2026-11-01", "n": 2, "sin": 1}]
        arts = pda.albaran(db, d.id)["articulos"]
        assert "ean" not in arts[0] and arts[1]["ean"] == EAN_A

        mal = pda.poner_ean(db, arts[0]["id"], "12345")
        assert mal["ok"] is False and mal["motivo"] == "no_ean"
        rep = pda.poner_ean(db, arts[0]["id"], EAN_A)
        assert rep["ok"] is False and rep["motivo"] == "repetido" and rep["otro"] == "Llave"
        assert pda.poner_ean(db, arts[0]["id"], EAN_A, forzar=True)["ok"] is True
        assert pda.poner_ean(db, arts[0]["id"], EAN_B)["articulo"]["ean"] == EAN_B
        assert db.get(Article, arts[0]["id"]).ean == EAN_B
        assert pda.albaranes(db)[0]["sin"] == 0
        assert "ean" not in pda.poner_ean(db, arts[0]["id"], "")["articulo"]
        assert pda.poner_ean(db, 99999, EAN_A) is None

    def test_los_terminados_no_salen(self, db):
        d = _doc(db, "PROVEEDOR UNO", dt.date(2026, 11, 1), [{"d": "Disco", "c": 2}])
        d.terminado_at = dt.datetime(2026, 11, 2)
        db.commit()
        assert pda.albaranes(db) == []


class TestAcceso:
    def test_el_codigo_de_la_pda_solo_vale_para_la_pda(self, client, monkeypatch):
        from app.services import access_service as acc
        assert acc.PERSONAS["pda"][0] == "pda"
        monkeypatch.setattr(acc, "config", lambda fresh=False: {"secret": "x", "version": 1, "codigos": {}})
        monkeypatch.setattr(acc, "sesion", lambda tok: {"rol": tok, "persona": tok} if tok else None)
        pda_ = {"Authorization": "Bearer pda"}
        assert client.get("/api/pda/albaranes", headers=pda_).status_code == 200
        assert client.get("/api/pda/precio?q=abc", headers=pda_).status_code == 200
        for ruta in ("/api/documents", "/api/firmas", "/api/tarifas", "/api/pdaotra", "/api/compras/proveedores"):
            assert client.get(ruta, headers=pda_).status_code == 403, ruta
        assert client.delete("/api/documents/1", headers=pda_).status_code == 403
        assert client.get("/api/pda/albaranes", headers={"Authorization": "Bearer tienda"}).status_code == 200
        for rol in ("reparto", "consulta"):
            assert client.get("/api/pda/albaranes", headers={"Authorization": f"Bearer {rol}"}).status_code == 403
        assert client.get("/api/pda/albaranes").status_code == 401
