"""Tarifas de proveedor: códigos comodín y artículos repetidos de Zabaleta, y la medida por la que se filtra
una familia (oct. 2026). Datos inventados: el repositorio es público, no van precios reales."""
from app.services import tarifas_service as ts

CAB = ["CATEGORÍA", "SUBCATEGORÍA", "ARTÍCULO", "DESCRIPCIÓN", "UD", "Nº COMPRAS", "PRECIO COMPRA ANT.", "FECHA ANT.",
       "PRECIO COMPRA ACTUAL", "FECHA ACT.", "EVOL.", "MÍN. 12 MESES", "AVISO", "MARGEN", "P.V.P. S/IVA", "P.V.P. C/IVA"]


def fila(cat, sub, ref, desc, coste, fecha, margen="40%", pvp="1,00 €", iva="1,20 €"):
    return [cat, sub, ref, desc, "ud", "1", "—", "—", coste, fecha, "—", coste, "", margen, pvp, iva]


def linea(fecha, ref, desc, neto, cat="Fontanería interior", sub="Latón roscado"):
    return [fecha, "600000001", "R-1", "01/01/2026", cat, sub, ref, desc, "1,00", neto, "0%", "0%", neto, neto, "Válida"]


def hojas():
    tarifa = [["TARIFA"], ["sub"], CAB,
              fila("Fontanería interior", "Latón roscado", "AAA1", "MANGUITO DE 16 MM", "2,000 €", "2026-05-15"),
              fila("Fontanería interior", "Latón roscado", "INC", "MANGUITO DE 16 MM", "9,000 €", "2026-06-30"),
              fila("Fontanería interior", "Latón roscado", "VIEJO1", "MAMELON 1/2´ M M", "0,500 €", "2025-03-15"),
              fila("Fontanería interior", "Latón roscado", "30999999", 'MACHON DOBLE LATON 1/2"', "0,600 €", "2026-06-30")]
    detalle = [["Fecha fact."] * 15,
               linea("2026-05-15", "AAA1", "MANGUITO DE 16 MM", "2,000 €"),
               linea("2026-06-15", "INC", "MANGUITO DE 16 MM", "3,000 €"),
               linea("2026-06-30", "INC", "BOYA PLASTICO ROSCADA 1/2", "9,000 €", cat="Ferretería y varios", sub="Varios"),
               linea("2025-03-15", "VIEJO1", "MAMELON 1/2´ M M", "0,500 €"),
               linea("2026-06-30", "30999999", 'MACHON DOBLE LATON 1/2"', "0,600 €")]
    return {"Tarifa": tarifa, "Detalle facturas": detalle}


def test_comodin_separa_cada_articulo(monkeypatch):
    monkeypatch.setattr(ts, "AJUSTES_ZAB", {"comodines": r"^(INC|\$.+)$", "antes": {}, "tambien": {}, "articulos": {}})
    d = ts.leer_zabaleta(hojas())
    refs = {a["ref"]: a for a in d["articulos"]}
    assert "INC" not in refs                           # la fila que mezclaba todo ya no sale
    boya = refs["INC~boya-plastico-roscada-1-2"]       # la boya va sola, con su precio
    assert boya["comodin"] and boya["codigo"] == "INC" and boya["coste"] == 9.0
    assert not any("manguito" in r for r in refs if r.startswith("INC~"))  # el manguito ya está con su código


def test_mismo_articulo_con_codigo_nuevo(monkeypatch):
    monkeypatch.setattr(ts, "AJUSTES_ZAB", {"comodines": r"^(INC|\$.+)$", "antes": {"30999999": ["VIEJO1"]},
                                             "tambien": {}, "articulos": {}})
    d = ts.leer_zabaleta(hojas())
    refs = {a["ref"]: a for a in d["articulos"]}
    assert "VIEJO1" not in refs
    a = refs["30999999"]
    assert a["antes"] == ["VIEJO1"] and a["alias"] == ["VIEJO1"]
    assert a["coste"] == 0.6 and a["precio_ant"] == 0.5 and a["evol"] == 20.0
    assert [l.get("codigo") for l in d["lineas"]["30999999"]] == ["VIEJO1", None]


def test_pvp_como_la_hoja():
    assert ts._pvp_zab(4.25, 40) == (6.0, 7.25)        # 5,95 → 6,00 (a 0,10 € desde 5 €)
    assert ts._pvp_zab(2.99, 25) == (3.75, 4.55)       # 3,7375 → 3,75 (a 0,05 €)
    assert ts._pvp_zab(102.5 / 1.25, 25)[1] == 124.05  # con IVA, a 0,05 €


def test_medida_principal():
    mp = ts.medida_principal
    assert mp("20 × ½″") == ("20", 20.0)
    assert mp('1/2"×16') == ("16", 16.0)               # pieza para tubo con rosca: manda el tubo
    assert mp('3/4"×1/2"') == ('3/4"', 1000.75)        # solo pulgadas: la primera, detrás de los milímetros
    assert mp("Cu 15 → 16") == ("16", 16.0)
    assert mp("50×50") == ("50×50", 50.0)
    assert mp("320×300×95") == (None, None)
    assert mp("400 mm") == ("400 mm", 400.0)
    assert mp(None) == (None, None)


def test_medidas_de_una_pieza():
    md = ts.medidas_de
    assert md('3/4"×1/2"') == ['3/4"', '1/2"']        # la reducción sale también en 1/2"
    assert md("125-110") == ["125", "110"]
    assert md("20 × ½″") == ["20"]                     # pieza con rosca para tubo: solo por el tubo
    assert md("50×50") == ["50×50"]


def test_silva_lee_rollos_y_precios_por_cantidad():
    """Tarifa de mallas de Silva Moreira (datos inventados: el repo es público)."""
    from app.services import tarifas_service as ts
    hojas = {
        "INICIO": [["T"], ["Coste", "Pedido 111.22222 del 01/01/2026"]],
        "TARIFA": [["T"], ["Margen tarifa:", "35%"], [], ["Código", "Familia", "Gama"],
                   ["A1", "Malla anudada ligera", "Gama X", "100", "8", "15", "100", "X 8-100-15 100m", "10",
                    "10,00 €", "ene-26", "35%", "13,50 €", "16,35 €", "0,14 €", "12,50 €", "15,15 €", "11,50 €", "13,90 €", "25%", "15%"],
                   ["A2", "Malla anudada ligera", "Gama X", "120", "9", "15", "100", "X 9-120-15 100m", "10",
                    "1.000,00 €", "ene-26", "35%", "1.350,00 €", "1.633,50 €", "", "", "", "", ""]],
    }
    d = ts.leer_silva(hojas)
    a, b = d["articulos"]
    assert a["medida_c"] == "100/8/15" and a["tipo"] == "Rollo de 100 m" and a["metros"] == 100
    assert a["coste"] == 10 and a["pvp"] == 13.5 and a["margen"] == 35
    assert a["escalas"] == [
        {"nombre": "Desde 5 rollos", "pvp": 12.5, "pvp_iva": 15.15, "margen": 25.0},
        {"nombre": "Palé completo (10 rollos)", "pvp": 11.5, "pvp_iva": 13.9, "margen": 15.0}]
    assert b["coste"] == 1000 and b["escalas"] is None
    assert d["lineas"]["A1"][0]["factura"] == "111.22222" and d["lineas"]["A1"][0]["fecha"] == "2026-01-01"
    grupos = ts._grupos_sub(d["articulos"], d["orden_grupos"]["Malla anudada ligera"])
    assert [m["valor"] for m in grupos[0]["medidas"]] == ["100/8/15", "120/9/15"]
    assert grupos[0]["medidas"][0]["escalas"][1]["pvp"] == 11.5 and "escalas" not in grupos[0]["medidas"][1]
