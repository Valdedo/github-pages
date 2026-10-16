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


# ── Construdeco: Pladur y Dinak (datos inventados) ────────────────────────
from app.services import construdeco as cd


def _pladur(*filas):
    cab = ["CATEGORÍA", "CÓDIGO", "DESCRIPCIÓN", "UNIDAD", "P. COMPRA (€)", "P. VENTA S/IVA (€)", "MARGEN", "ÚLTIMO ALBARÁN", "NOTAS"]
    return {"TARIFA": [["TARIFA DE PRECIOS"] + [""] * 8, cab, *filas]}


def test_pladur_secciones_medidas_y_notas():
    h = _pladur(
        ["▌ PLACAS"] + [""] * 8,
        ["", "111", "PD-PLADUR N 13X1200X2500 BA", "UD", "10,0000 €", "11,50 €", "15%", "02/03/2026", "Anterior: 9,00€ (ene 2026) → +11%"],
        ["", "112", "PD-PLADUR N 13X1200X2000 BA", "UD", "8,0000 €", "9,20 €", "15%", "02/03/2026", "Anterior: 20,00€ (jun 2024) → -6%"],
        ["▌ PERFILERÍA"] + [""] * 8,
        ["", "—", "PD-MONTANTE 70/35 Z1  L=3000", "UD", "3,0000 €", "3,60 €", "20%", "01/02/2026", ""],
        ["▌ ACCESORIOS"] + [""] * 8,
        ["", "113", "PD-CAJA TORN PM 3,9X25 CAJA 1000UDS", "UD", "7,0000 €", "9,10 €", "30%", "01/02/2026", ""],
        ["LEYENDA: fondo amarillo"] + [""] * 8,
    )
    d = cd.leer_pladur(h)
    a = {x["descripcion"]: x for x in d["articulos"]}
    assert len(a) == 4
    placa = a["PD-PLADUR N 13X1200X2500 BA"]
    assert (placa["categoria"], placa["subcategoria"], placa["tipo"], placa["medida_c"]) == ("Placas", "Estándar", "Pladur N 13 mm", "1200×2500")
    assert placa["precio_ant"] == 9.0 and placa["fecha_ant"] == "ene-26" and placa["evol"] == 11.1 and placa["pvp_iva"] == 13.92
    # Una nota que no cuadra con el precio (copiada de otra fila) no se usa
    assert a["PD-PLADUR N 13X1200X2000 BA"]["precio_ant"] is None and d["notas_mal"] == 1
    m = a["PD-MONTANTE 70/35 Z1  L=3000"]
    assert m["codigo"] is None and m["ref"].startswith("PD~") and m["medida_c"] == "70/35" and m["categoria"] == "Perfilería"
    t = a["PD-CAJA TORN PM 3,9X25 CAJA 1000UDS"]
    assert t["subcategoria"] == "Tornillos" and t["medida_c"] == "25 mm · caja 1000"


def _dinak(*filas, meses=("May-24", "Feb-26")):
    cab = ["Referencia\nCONSTRUDECO", "Descripción del Producto", "Diám.\n(mm)", "Código\nDINAK", *meses,
           "Último P.\nCompra (€)", "Var. %", "Tarifa\nOficial (€)", "P.Venta\n(€)"]
    return {"TARIFA DINAK": [["TARIFA DINAK"], ["IDENTIFICACIÓN", "", "", "", "HISTORIAL"], cab, *filas]}


def test_dinak_historial_por_meses_y_codigos_repetidos():
    h = _dinak(
        ["  CHIMENEA DOBLE PARED (DP) — DIÁMETRO 150 mm  |  Sistema inox", "", "", "", "", "", "", "", "", ""],
        ["X1", "Módulo Recto 150×1000 mm DP", "150", "X1", "10,00 €", "12,00 €", "12,00 €", "+20,0%", "30,00 €", "16,00 €"],
        ["X2a", "Tubo 150×1000 mm DP", "150", "X2", "9,00 €", "", "9,00 €", "", "", "12,00 €"],
        ["X2b", "Codo 45° D150 DP", "150", "X2", "", "11,00 €", "11,00 €", "", "", "14,67 €"],
        ["X3", "", "", "", "", "", "", "", "", ""],
        ["  CHIMENEA SIMPLE PARED (SW) — DIÁMETRO 120 mm", "", "", "", "", "", "", "", "", ""],
        ["X4", "Módulo Recto 120×1000 mm SW", "120", "X4", "", "5,00 €", "5,00 €", "", "", "6,67 €"],
    )
    d = cd.leer_dinak(h)
    a = {x["ref"]: x for x in d["articulos"]}
    assert d["incompletas"] == ["X3"]
    t = a["X1"]
    assert (t["categoria"], t["subcategoria"], t["tipo"], t["medida_c"]) == ("Chimenea doble pared", "Tubos", "Tubo recto 1 m", "Ø150")
    assert [x["fecha"] for x in t["hist"]] == ["may-24", "feb-26"] and t["evol"] == 20.0 and t["pvp_fab"] == 30.0
    assert t["margen"] == 33.3 and t["pvp_iva"] == 19.36
    # El mismo código Dinak en dos filas: se queda la del precio más reciente y la otra referencia busca la misma
    assert "X2a" not in a and "X2a" in a["X2b"]["alias"]
    assert a["X4"]["categoria"] == "Chimenea simple pared" and a["X4"]["nombre"] == "Tubo recto 1 m Ø120 simple pared"


def test_dinak_columna_de_mes_nueva():
    h = _dinak(["Y1", "Abrazadera de Unión D200 DP", "200", "Y1", "4,00 €", "4,40 €", "4,60 €", "4,60 €", "+15,0%", "", "6,13 €"],
               meses=("May-24", "Feb-26", "Oct-26"))
    a = cd.leer_dinak(h)["articulos"][0]
    assert a["fecha"] == "oct-26" and a["precio"] == 4.6 and a["precio_ant"] == 4.4 and a["tipo"] == "Abrazadera de unión"


def test_ladrillos_lee_por_nombre_de_columna():
    """Tarifa de ladrillos (datos inventados: el repo es público). Las columnas se buscan por su nombre,
    se vende por unidad y el palé completo va como precio por cantidad."""
    from app.services import tarifas_service as ts
    cab = ["Código", "Familia", "Grupo", "Producto", "Medidas (cm)", "Uso", "Ud/m²", "Kg/ud", "Ud/palé",
           "Se compra por", "Coste (€)", "Fecha", "Pedido", "Coste anterior (€)", "Fecha anterior", "PVP/ud",
           "PVP/ud con IVA", "Margen ud", "PVP palé", "PVP palé con IVA", "Coste palé", "Margen palé", "PVP/m² con IVA", "Notas"]
    hojas = {"TARIFA": [
        ["TARIFA"], ["sub"], [], cab,
        ["B2", "Ladrillo hueco", "Formato 24 cm", "Ladrillo B", "24×11,5×8", "", "32,00", "2,000", "100", "centena",
         "10,00 €", "02/02/2026", "", "8,00 €", "01/01/2025", "0,15 €", "0,182 €", "50,0%", "11,00 €", "", "", "", "", ""],
        ["A1", "Ladrillo hueco", "Formato 24 cm", "Ladrillo A", "24×11,5×4", "Ahorro mortero", "32,00", "1,000", "200", "centena",
         "5,00 €", "02/02/2026", "P-1", "", "", "0,10 €", "", "", "12,00 €", "", "", "", "",
         "Precio a confirmar: coste antiguo."],
        ["PAL", "Palé de madera", "", "Palé", "", "", "", "", "", "ud", "4,00 €", "02/02/2026", "P-1", "", "", "4,00 €"],
        [], ["Leyenda: notas al pie"],
    ]}
    d = ts.leer_ladrillos(hojas)
    b, a, p = d["articulos"]
    assert b["descripcion"] == "Ladrillo B · 24×11,5×8 cm" and b["coste"] == 0.1 and b["ud_compra"] == "centena"
    assert b["pvp"] == 0.15 and b["pvp_iva"] == 0.1815 and b["margen"] == 50.0 and b["evol"] == 25.0
    assert b["escalas"] == [{"nombre": "Palé completo (100 ud)", "cantidad": 100, "pvp": 0.11, "pvp_iva": 0.1331,
                             "total": 11.0, "total_iva": 13.31, "margen": 10.0}]
    assert b["ud_m2"] == 32 and b["kg_ud"] == 2 and b["ud_pale"] == 100
    assert a["nota"] == "Precio a confirmar" and a["uso"] == "Ahorro mortero" and a["escalas"][0]["margen"] == 20.0
    assert p["ud_compra"] == "ud" and p["coste"] == 4 and p["escalas"] is None and p["margen"] == 0
    assert [l["precio"] for l in d["lineas"]["B2"]] == [8.0, 10.0] and d["lineas"]["B2"][1]["factura"] == ""
    assert d["orden_familias"] == ["Ladrillo hueco", "Palé de madera"]
    # En la familia se queda el orden de la hoja (B antes que A), no el alfabético
    grupos = ts._grupos_sub([x for x in d["articulos"] if x["categoria"] == "Ladrillo hueco"], d["orden_grupos"]["Ladrillo hueco"], False)
    assert [m["ref"] for m in grupos[0]["medidas"]] == ["B2", "A1"]
    assert grupos[0]["medidas"][0]["ud_pale"] == 100 and grupos[0]["medidas"][1]["uso"] == "Ahorro mortero"
