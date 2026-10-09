"""Clasificación propia de la tarifa de Zabaleta: familia → grupo → tipo (+ medida) y nombre claro.

Uso: python3 tools/zabaleta-clasifica.py backend/app/data/zabaleta_catalogo.json <carpeta con zab.json>
zab.json = respuesta de la acción «hoja» del Apps Script con la pestaña «Tarifa» de la hoja de Zabaleta.
Cuando entren referencias nuevas, añadir su regla o su nombre en NOMBRES y volver a generar."""
import json, re, sys, unicodedata

N = sys.argv[2] if len(sys.argv) > 2 else '.'
hoja = json.load(open(f'{N}/zab.json'))['hojas']['Tarifa']
arts = [(r[2].strip(), r[3].split(' — ')[0].strip(), r[0], r[1]) for r in hoja[4:] if r[2].strip()]

S, E, A, C, L, M, V, B, T, K, H, NC, G, X = (
    'Saneamiento exterior', 'Evacuación PVC', 'Agua y acometidas', 'Cobre', 'Latón roscado',
    'Multicapa, PP-R e inox', 'Llaves y válvulas', 'Baño y desagües', 'Termos y agua caliente', 'Calefacción',
    'Chimeneas, estufas y ventilación', 'Canalón', 'Gas, sellado y soldadura', 'Fijación, aislamiento y herramienta')
ORDEN_FAM = [S, E, A, C, L, M, V, B, T, K, H, NC, G, X]

def U(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.combining(c)).upper()

def pulg(s):
    """«1.1/4», «11/4», «1 1/4´» → '1 1/4"'; «3/4´» → '3/4"'."""
    s = s.replace('´', '').replace('"', '').replace("'", '').strip()
    m = re.fullmatch(r'(\d)[ .]?(\d/\d)', s)
    if m:
        return f'{m.group(1)} {m.group(2)}"'
    return s + '"'

def valor_pulg(p):
    p = p.replace('"', '')
    m = re.fullmatch(r'(\d) (\d)/(\d)', p)
    if m:
        return int(m.group(1)) + int(m.group(2)) / int(m.group(3))
    m = re.fullmatch(r'(\d)/(\d)', p)
    if m:
        return int(m.group(1)) / int(m.group(2))
    try:
        return float(p)
    except ValueError:
        return 0

def num(s):
    try:
        return float(s.replace(',', '.'))
    except ValueError:
        return 0

out = {}

def put(ref, f, g, n, t=None, m=None, o=None, foto=None):
    if o is None and m:
        ds = re.findall(r'\d+(?:[.,]\d+)?', m)
        o = num(ds[0]) if ds else 0
        if '"' in m:
            o = valor_pulg(re.split(r'[×x-]', m)[0])
    out[ref] = {'f': f, 'g': g, 'n': n, 't': t, 'm': m, 'o': o, 'foto': foto}

# Nombres a mano para lo que no sigue un patrón (o se entiende mal)
NOMBRES = {
    'U200F75': 'Canal con rejilla de fundición 750×200 D400', 'EUROKIT': 'Canaleta de drenaje ULMA 1 m con rejilla galvanizada',
    '340202838': 'Rejilla de fundición para imbornal 29×39×35', 'R1PZ': 'Tapa de fundición redonda D400 (con marco)',
    '$5002': 'Tapa y aro de fundición Ø650 con cierre', '2REGMB55': 'Registro tipo buzón 55×55',
    'SR01061': 'Armario para contador de agua con mirilla 436×294×114', '25111755': 'Tapa y aro de fundición Ø600 C250',
    '5855516': 'Registro hidráulico de fundición 200×200 B125', 'GEO120': 'Geotextil en rollo 120 g/m²',
    'POVAL0510': 'Tubo de ventilación de aluminio corrugado Ø125', 'SI01011': 'Bote sifónico', 'SI01102': 'Embellecedor de bote sifónico con tornillos',
    '0935003821': 'Caldereta vertical con rejilla inox Ø40/50 115×115', '0439002439': 'Sumidero sifónico salida vertical 150×150 Ø50',
    '0935010164': 'Injerto para tubo 90º Ø160 a 110', '0935005931': 'Injerto clip 75-50 (corona Ø57)',
    '0935005962': 'Injerto clip 90-50 (corona Ø57)', '$0385': 'Tapón hembra PVC Ø200', 'T1105040': 'Tapón reductor doble 110 a 50 y 40',
    'T1255040': 'Tapón reductor doble 125 a 50 y 40', 'SI01013': 'Manguito de WC excéntrico Ø90',
    'SI01018': 'Junta labiada excéntrica de WC', '0501002303': 'Fijación de WC M5×70 con taco',
    'PVCR40': 'Hidrotubo PVC flexible Ø40 (m)', '0385720721': 'Tubo PVC presión 10 atm Ø200 con junta (m)',
    '0935000607': 'Enlace 3 piezas H-H 1 1/4" PVC presión', '0935000776': 'Racor unión 3 piezas H-H encolar Ø40 PVC presión',
    '0935001599': 'Terminal hembra encolar Ø40 × rosca macho 1 1/4" PVC presión', '0935010041': 'Enlace mixto PVC Ø40 × rosca 1 1/4" junta plana',
    'PE020': 'Polietileno 10 atm Ø20 PE40 (m) — el mismo que PAL10020, más caro', 'PE025': 'Polietileno 10 atm Ø25 PE40 (m) — el mismo que PAL10025, más caro',
    '0385703564': 'Polietileno 10 atm Ø75 PE40 (m)', 'PE110040': 'Polietileno PE100 10 atm Ø40 (m)', 'PAG10025': 'Polietileno agrícola 10 atm Ø25 (m)',
    '240300050': 'Collarín de toma de fundición para PVC/PE DN50 × 3/4"',
    '$4128': 'Grupo de presión CMH 14.60.1 con Presflo', '00100222': 'Bomba solar SLR 25/6-180',
    '00100555': 'Controlador de presión Aquacontrol Plus regulable 1 1/4"', 'CUR15': 'Tubo de cobre en rollo Ø15 (m)',
    'GN06032': 'Racor de gas cobre 1" × 28 (asiento cuello)', 'GN06123': 'Racor de gas cobre 3/4" × 28 (asiento plano)',
    'GN06019': 'Racor de gas cobre 3/4" × 22 (asiento cuello)', 'GN06122': 'Racor de gas cobre 1" × 22 (asiento plano)',
    'GN06121': 'Racor de gas cobre 3/4" × 22 (asiento plano)', 'GL11022': 'Racor de gas rosca 20/150 × cobre 12',
    'CU8306': 'Manguito electrolítico 3/4" reforzado', 'BR09608': 'Codo cobre-rosca 22 × 3/4" hembra',
    'BR34112': 'Enlace recto cobre-rosca 42 × 1 1/2"', '0638052569': 'Enlace de compresión 1/2" × 15 (serie NT/200)',
    'M452942': 'Racor unión 1" macho-hembra', 'M342100': 'Racor tuerca corredera 1/2"', 'M380201': 'Alargadera (marsella) 1/2" M-H 3 cm',
    '0766002072': 'Machón reducido inox 3/4" × 1/2"', 'GL11081': 'Juntas de goma 20×150 (paquete 100)', '0638053149': 'Junta 1" 42×32×1',
    '0638056929': 'Juntas de radiador 1" 48×34×1,6 (50 u.)', '0913006076': 'Junta plana ancha para racor 1" 30×20×2,5',
    '0230H12H12': 'Latiguillo super 1/2"-1/2" H-H 300 mm', '0650H1': 'Latiguillo 1" hembra 500 mm',
    'AC57024': 'Latiguillo 1/2"-3/8" H-H 300 mm', 'AC57012': 'Latiguillo 3/8" hembra 200 mm', 'AC57013': 'Latiguillo 3/8" hembra 250 mm',
    'POVAL0530': 'Juego de latiguillos de grifería 10/100 rosca larga', 'RE01034': 'Flexo de ducha de acero',
    '1111013718': 'Juego de excéntricas 1/2" × 3/4" 1,5 cm',
    '$0382': 'Filtro autolimpiante 2" PN25 H-H', '0347006049': 'Válvula reductora de presión con filtro D06F',
    '0313040634': 'Mando de palanca para llave de corte (recambio)', 'AC03066': 'Llave de corte de escuadra 1/2"-3/8" (Arco A80)',
    'CC99004': 'Llave de bola M-M 1" (Teknica)', '0750039320': 'Válvula de cesta con rebosadero rectangular 1 1/2" × 115',
    '0750001552': 'Válvula de fregadero con rebosadero flexible 1 1/2" × 70', 'AC03027': 'Llave de bola 1/2" M-H mariposa',
    '0758004421': 'Llave de escuadra América 1/2" × 3/8"', 'VV01001': 'Válvula de lavabo 1 1/2"', 'RE01032': 'Grifo doble de lavadora',
    '0758114134': 'Llave de escuadra América 80 mando metálico 3/8" × 1/2"', '0766010718': 'Válvula de esfera H-H 3/4" Prestige (azul)',
    '1010004364': 'Válvula de desagüe universal redonda latón (SL-45009)', 'SI01008': 'Sifón en «Y» con válvula 1 1/2"',
    'AR019': 'Válvula click-clack latón cromado (tapón Ø63)', '0766011012': 'Válvula de esfera M 1/2" × 3/4" para manguera',
    '0638051479': 'Llave de paso hembra 1/2" serie 200', 'AC03069': 'Llave de corte de escuadra 1/2"-1/2" estándar',
    '0766002483': 'Válvula de esfera 1/2" PN25 (3030I)', 'AC03142': 'Válvula de radiador para soldar Ø18 (Arco Texas)',
    'AC03121': 'Pomo redondo para válvula Arco Texas', '0433003268': 'Válvula de radiador escuadra 1/2" con ovalillo (Orkli)',
    '0433000366': 'Detentor escuadra 1/2" Ø12 (Orkli)', '0638051599': 'Detentor hembra 1/2" escuadra',
    'AC02051': 'Válvula de descarga térmica Caleffi 543', 'AC05052': 'Llenado automático 1/2" Caleffi',
    '0425006321': 'Mezcladora termostática 1/2" 30-48 ºC (Caleffi 520)', '0638056254': 'Purgador automático PA5 (rosca izquierda)',
    'AC06011': 'Purgador 3/8" 502N niquelado', '0382000552': 'Válvula de seguridad 1/2" H-H 7 bar',
    '28365000': 'Grupo de seguridad para termo Flexbrane 3/4"', 'AC09051': 'Filtro de gasoil 3/8"',
    '0313000363': 'Llave de corte de bola multicapa 16×2', '0314000003': 'Válvula de esfera multicapa press 16×2 (Júcar)',
    '0314000004': 'Válvula de esfera multicapa press 20×2 (Júcar)', '0433009642': 'Ovalillos para multicapa 16×2 M24×1,5 (bolsa)',
    '0319006604': 'Tubo inox AISI-316 Ø15×0,6 (m)', '0319020884': 'Salvatubos inox Ø15 (Filpress)',
    '$5036': 'Acumulador inox 316 80 L horizontal mural', '0638010157': 'Acumulador inox 300 L',
    'C100VHPC': 'Interacumulador inox 316 mural 100 L doble serpentín',
    '0782000698': 'Termo eléctrico Velis Tech Dry WiFi 50 L', '302996': 'Termo eléctrico anticalcáreo reversible 50 L',
    '30107464': 'Termo eléctrico Kenro Ceramic 100 L', '302480': 'Termo eléctrico Ceramic GCV 80 L', '0638000023': 'Termo eléctrico H580 serie 5 80 L',
    '30107474': 'Termo eléctrico Kenro Ceramic 150 L', '302998': 'Termo eléctrico anticalcáreo reversible 100 L',
    '0638215974': 'Termo eléctrico V580 serie 5 80 L', '302997': 'Termo eléctrico anticalcáreo reversible 80 L',
    '0638215967': 'Termo eléctrico V550 serie 5 50 L', '0638215950': 'Termo eléctrico V530 serie 5 30 L',
    '7705412': 'Calentador de gas atmosférico 11 L serie I Eco (butano/propano)', '0782000503': 'Calentador atmosférico bajo NOx Fast R X (GLP)',
    '0638006561': 'Calentador de gas estanco bajo NOx 11 L FI Blue (propano)', '0759000369': 'Calentador de gas atmosférico 11 L Cami (butano)',
    '0373022673': 'Bomba circuladora Grundfos Alpha1 GO 25-60', '0638005083': 'Circulador Quantum Maxi 1"',
    '0638054831': 'Radiador de aluminio Dubal 60 (1 elemento)', 'FR72052': 'Radiador de aluminio Xian 600 (1 elemento)',
    'AC94304': 'Termostato analógico para toallero (blanco)', '0382000133': 'Termostato de varilla 275 mm 20-80 ºC',
    '0382076455': 'Resistencia eléctrica 2000 W 445 mm', '0382006971': 'Termostato de inmersión 30-90 ºC 100 mm',
    'AC94302': 'Resistencia 300 W para toallero', '0638055871': 'Termostato ambiente TM-1R', '0638057868': 'Termostato de contacto',
    'TS-TERM': 'Termostato de resistencia de termo (Ferco)', '0382002928': 'Resistencia de cobre para termo 1200 W',
    'FIG02002': 'Tubo coaxial 60/100 1 m M-H', 'FIG02001': 'Tubo coaxial 60/100 0,5 m M-H', 'FIG02006': 'Codo coaxial 60/100 45º M-H',
    'FIG02004': 'Codo coaxial 60/100 90º M-H', 'FIG02005': 'Codo coaxial 60/100 90º H-H', '1177047417': 'Manguito coaxial 60/100 H-H',
    '16922000': 'Vaso de expansión calefacción Flexcon Premium 25 L', '51100014': 'Vaso de expansión calefacción Aquasystem 24 L',
    '24559000': 'Vaso de expansión ACS Airflix 25 L 4 bar', '51100215': 'Vaso de expansión multifunción Aquasystem 24 L 2,5 bar',
    'AC16065': 'Soporte en L para vaso de expansión', '27909000': 'Soporte 90º para vasos de expansión 8-25 L',
    'AC12002': 'Manómetro 0-10 kg Ø53 conexión horizontal', 'AC12006': 'Manómetro 0-10 kg Ø53 conexión vertical',
    'AC13067': 'Vaina para termómetro cobre 1/2" 10 cm', 'AC13064': 'Vaina para termómetro latón 1/2" 5 cm', '6790005': 'Vaina latón 1/2" 10 cm',
    'CORAL-MF': 'Estufa de pellet 15 kW color marfil (Coral)', '30008289': 'Estufa de leña doble cara con cristales',
    '$4016': 'Kit de canalización izquierdo para estufa Coral', '30008299': 'Leñero para estufa Cairo-90D-Box',
    'RE15RB80': 'Rejilla de ventilación regulable para tubo Ø80 (blanca)', '0676018121': 'Tubo flexible de aluminio aislado Ø82 (m)',
    'SU2040': 'Empalme campana 180×90 a Ø150', 'SU2050': 'Codo vertical campana 90º 180×90 a Ø150',
    '1177011555': 'Colector de hollín con desagüe doble pared Ø200', '1177006308': 'Adaptador de caldera doble pared Ø200',
    '1177032840': 'Colector de hollín pared simple Ø80 (SWJ)', '1177003300': 'Te 90º M-H pared simple Ø80',
    '1177032048': 'Módulo recto pared simple Ø80 (SWJ)', '1177006186': 'Te 90º doble pared Ø200',
    '1177006148': 'Módulo extensible corto doble pared Ø200', '03011512B': 'Sombrerete antilluvia doble pared Ø150',
    '1177001455': 'Sombrerete antilluvia pared simple Ø175', '1177035100': 'Sombrerete pared simple Ø80', '1177033090': 'Codo 45º pared simple Ø150',
    '1177038583': 'Anclaje ligero con tuerca pared simple Ø80', '1177031836': 'Abrazadera de unión pared simple Ø80',
    '1177008883': 'Abrazadera de unión doble pared Ø200',
    '0385702956': 'Canalón PVC 25 (tramo de 4 m, precio por m)', '0385702970': 'Enlace de canalón 25', '0385702963': 'Reducción de bajante 90/75',
    '0385702994': 'Bajada central canalón 25', '0385703144': 'Bajada exterior derecha canalón 33', '0385702987': 'Tapa de canalón 25',
    '0385703069': 'Gancho de canalón 25 (sin banda, vertical)', '0385703007': 'Bajada exterior derecha canalón 25',
    '0385703014': 'Bajada exterior izquierda canalón 25', '0385703021': 'Ángulo exterior canalón 25',
    'FO02015': 'Bolsa de recambios de cisterna (ref. 0153004610)', '0750014965': 'Kit de cisterna A-53', 'FO02014': 'Cisterna sin equipar 15 L',
    '0755521984': 'Mecanismo de descarga universal simple', '0755529065': 'Grifo flotador universal de llenado rápido (alimentación lateral)',
    'AC42091': 'Boya de plástico roscada 1/2"', 'FO01017': 'Tornillos de lavabo (ref. 0138564010)', 'SI01002': 'Sifón de botella extensible 1 1/2"',
    '0740000433': 'Teléfono de ducha 3 funciones City Air',
    'AC18008': 'Estaño en rollo tipo 6% (Cabel)', 'AC18001': 'Estaño plata 6% certificado en rollo (Cabel)',
    'AC18019': 'Estaño plata 8% certificado en rollo (Cabel)', 'AC18101': 'Varilla de estaño-plomo 50% (100 g)',
    'AC79305': 'Decapante líquido para soldar Griffon S-39 (pequeño)', '1270051': 'Decapante en gel para soldar Griffon S-39',
    '0863002720': 'Pastilla de estearina en barra 200 g', 'AC96011': 'Bombona de gas MAPP para soplete',
    '01330205': 'Hilo sellador de roscas Loctite 55 (160 m)', '505018': 'Hilo sellador de roscas Ceys (160 m)',
    'AC18015': 'Cáñamo en madeja 200 g', '0863002973': 'Cáñamo en bote 80 g', 'AC18021': 'Teflón en rollo 19 mm (amarillo, gas)',
    'AC18023': 'Teflón en rollo 12 mm (blanco)', 'AC96038': 'Masilla anticorrosiva 400 g', '505529': 'Silicona multiusos neutra secado exprés transparente',
    '504808': 'Espuma de poliuretano de fijación y montaje 750 ml (pistola)',
    '0490002778': 'Manguera de butano 1,5 m con 2 abrazaderas', 'GL10071': 'Manguera de gas GLP (m)',
    'GL11001': 'Llave de gas 20×150 cromada con patas (butano/propano)', 'GN05061': 'Llave interior de gas 1/2" cromada con patas',
    '$0481': 'Soporte perforado inox 38×40 400 mm', '0481000254': 'Abarcón inox AISI 304 Ø220 M10', 'SP00U': 'Soporte sobre chapa ondulada C25',
    '0319000497': 'Abrazadera simple inox Ø15 con tirafondo', '0065018527': 'Tirafondo M6×30', '0102000295': 'Taco Duopower 6×30 (100 u.)',
    '0501001676': 'Tornillo doble rosca M8×60', '1010002674': 'Coquilla aislante Cabelflex 9-35 (m)',
    '0435003580': 'Tubo aislante K-Flex PE 9×42 (m)', '0435003550': 'Tubo aislante K-Flex PE 9×35 (m)', 'AI501': 'Cinta VID 3×50 (rollo 30 m)',
    '0896025656': 'Cortatubos cobre e inox 3-35 mm (Rothenberger)', '05076017': 'Broca SDS para hormigón 8×160', '05076023': 'Broca SDS para hormigón 10×160',
    'AC79543': 'Hoja de sierra para metal (Roth)', '1111': 'Bolsa de plástico Zabaleta', '0065035739': 'Abrazadera isofónica Ø40 M8-10',
    '0065002359': 'Abrazadera isofónica Ø60 M8-10', '1111010007': 'Filtro de aspiración inox 2" (para válvula de pie)',
    '1111009995': 'Filtro de aspiración inox 1 1/2" (para válvula de pie)', '1111009988': 'Filtro de aspiración inox 1 1/4" (para válvula de pie)',
    'E1000112': 'Válvula de retención Europa 1 1/2"', 'E1000034': 'Válvula de retención Europa 3/4"',
    '1111001661': 'Alargo de grifo M-H 1/2" 100 mm cromado', '1111001647': 'Alargo de grifo M-H 1/2" 50 mm cromado',
    '1111001760': 'Tapón macho 1/2" cromado', '1111000800': 'Reducción (marsella) 1/8" M × 1/4" H',
    '0313033820': 'Racor fijo macho multicapa 20 × 1/2"', '0758130728': 'Racor móvil hembra multicapa 16 × 1/2"',
    '0758129994': 'Te igual multicapa 16', '0758129802': 'Codo 90º multicapa 16 × rosca hembra 1/2"',
    '0313014017': 'Codo placa multicapa 16 × 1/2" corto', '0758129772': 'Codo 90º multicapa 20',
    '0758130648': 'Racor fijo macho multicapa 16 × 1/2" (rosca cónica)', '0758130082': 'Te reducida multicapa 20-16-16',
    '0758131003': 'Racor móvil hembra multicapa 20 × 1/2"', '0758130372': 'Te multicapa 20 con salida central hembra 1/2"',
    '0758130754': 'Manguito multicapa 16', '0758130778': 'Manguito multicapa 20', '0758130013': 'Te igual multicapa 20',
    '0758131157': 'Codo placa multicapa 20 × 1/2" corto', '0758130679': 'Racor fijo macho multicapa 20 × 1/2" (rosca cónica)',
    '0758130839': 'Racor fijo hembra multicapa 20 × 1/2"', '0758130532': 'Manguito reducido multicapa 20-16',
    '0313034442': 'Racor fijo hembra multicapa 20 × 1/2" (otra marca)',
    '0319014654': 'Curva 90º inox prensar H-H Ø15', '0319014951': 'Te igual inox prensar Ø15', '0319017310': 'Codo placa inox prensar Ø15 × 1/2"',
    '0319014593': 'Curva 45º inox prensar H-H Ø15', '0319014623': 'Curva 45º inox prensar H-M Ø15', '0319014685': 'Curva 90º inox prensar H-M Ø15',
    '0319021065': 'Racor 2 piezas inox prensar Ø15 × 1/2" (junta plana)', '0319014807': 'Manguito inox prensar Ø15',
    '0319014760': 'Unión macho inox prensar Ø15 × 1/2"', '0319014982': 'Te inox prensar Ø15 con salida hembra 1/2"',
}
GRUPOS = {
    S: ['Tubo de saneamiento', 'Arquetas de PVC', 'Tapas y registros de fundición', 'Canales y rejillas', 'Drenaje', 'Tubo corrugado para cables'],
    E: ['Tubo de PVC', 'Codos', 'Derivaciones e injertos', 'Manguitos y reducciones', 'Tapones', 'Sumideros y botes sifónicos'],
    A: ['Tubo de polietileno', 'Racores de latón para polietileno', 'Collarines de toma', 'PVC presión e hidrotubo', 'Bombas y grupos de presión', 'Pozo: retención y filtros'],
    C: ['Tubo de cobre', 'Codos y curvas', 'Manguitos, tes y reducciones', 'Paso de cobre a rosca', 'Racores de compresión (cobre / multicapa)', 'Reparación de tuberías'],
    L: ['Codos, tes y manguitos', 'Machones y reducciones', 'Tapones', 'Racores', 'Juntas'],
    M: ['Multicapa', 'PP-R termofusión (serie 7)', 'Inox prensar (Filpress)'],
    V: ['Llaves de paso', 'Llaves de escuadra y de lavadora', 'Latiguillos, flexos y alargos', 'Reductoras y filtros'],
    B: ['Cisternas y mecanismos', 'Válvulas de desagüe y sifones', 'Inodoro y lavabo: fijaciones y juntas', 'Ducha'],
    T: ['Termos eléctricos', 'Calentadores de gas', 'Acumuladores', 'Recambios y seguridad de termos'],
    K: ['Radiadores y sus válvulas', 'Circuladores', 'Vasos de expansión y seguridad', 'Salida de humos de caldera 60/100', 'Termostatos, manómetros y vainas', 'Gasoil'],
    H: ['Estufas', 'Tubo inox doble pared', 'Tubo inox pared simple', 'Anclajes y abrazaderas', 'Ventilación y tubo flexible'],
    NC: ['Canalón PVC gris'],
    G: ['Gas butano y propano', 'Soldadura de cobre', 'Sellado de roscas', 'Siliconas, masillas y espuma'],
    X: ['Fijación de tuberías', 'Aislamiento y vaina de tuberías', 'Herramienta', 'Otros'],
}

def bon(s):
    return s[0].upper() + s[1:] if s else s

for ref, d, cat, sub in arts:
    u = U(d)
    nm = NOMBRES.get(ref)
    # ── Saneamiento exterior
    if m := re.match(r'M\.TUBO SANEAMIENTO SN8 PE (\d+)( TEJA)?', u):
        put(ref, S, 'Tubo de saneamiento', f'Tubo corrugado SN8 doble pared Ø{m[1]}{" (teja)" if m[2] else ""} (m)',
            'Tubo corrugado SN8 doble pared (m)', m[1], foto='sn8')
    elif m := re.match(r'MTO\.TUBO TEJA (SN\d)( PN6)? (\d+)', u):
        t = f'Tubo PVC teja {m[1]}{" PN6" if m[2] else ""} (m)'
        put(ref, S, 'Tubo de saneamiento', f'Tubo PVC teja {m[1]}{" PN6" if m[2] else ""} Ø{m[3]} (m)', t, m[3], foto='teja')
    elif ref in ('U200F75', 'EUROKIT', '340202838'):
        put(ref, S, 'Canales y rejillas', nm, foto='canal-reja' if ref != '340202838' else 'rejilla')
    elif m := re.match(r'TAPA FUNDICION (\d+)X(\d+) (B125|C250)', u):
        put(ref, S, 'Tapas y registros de fundición', f'Tapa de fundición {m[1]}×{m[2]} {m[3]}',
            f'Tapa de fundición {m[3]} ({"peatonal" if m[3] == "B125" else "garaje, tráfico ligero"})', f'{m[1]}×{m[2]}', foto='tapa-fundicion')
    elif ref in ('R1PZ', '$5002', '2REGMB55', 'SR01061', '25111755', '5855516'):
        put(ref, S, 'Tapas y registros de fundición', nm, foto='tapa-fundicion')
    elif m := re.match(r'(TAPA|ARQUETA) GRIS CLARO D(\d+)X(\d+)', u):
        t = 'Arqueta de PVC gris' if m[1] == 'ARQUETA' else 'Tapa para arqueta de PVC gris'
        put(ref, S, 'Arquetas de PVC', f'{t} {m[2]}×{m[3]}', t, f'{m[2]}×{m[3]}', foto='arqueta')
    elif m := re.match(r'M\.DRENAJE (DOBLE PARED|S\.PARED) ROLLO (\d+)', u):
        doble = m[1].startswith('DOBLE')
        med = '100' if ref == 'DRSP110' else m[2]
        t = f'Tubo de drenaje {"doble pared" if doble else "pared simple"} en rollo (m)'
        put(ref, S, 'Drenaje', f'Tubo de drenaje {"doble pared" if doble else "pared simple"} Ø{med} (m)', t, med, foto='drenaje')
    elif ref == 'GEO120':
        put(ref, S, 'Drenaje', nm, foto='geotextil')
    elif m := re.match(r'M\.CO?A?RRUGADO D\.PARED ROLLO (\d+) L', u):
        med = '40' if ref == 'CEPR040' else m[1]
        put(ref, S, 'Tubo corrugado para cables', f'Tubo corrugado doble pared rojo Ø{med} ligero (m)',
            'Tubo corrugado doble pared rojo, ligero (m)', med, foto='corrugado')
    # ── Evacuación PVC
    elif ref in ('SI01011', 'SI01102', '0935003821', '0439002439'):
        put(ref, E, 'Sumideros y botes sifónicos', nm, foto='bote-sifonico')
    elif m := re.match(r'TUBERIA SERIE B COMPACTA (\d+) (\d) MTS', u):
        put(ref, E, 'Tubo de PVC', f'Tubo PVC serie B Ø{m[1]} (barra de {m[2]} m)', f'Tubo PVC serie B (barra de {m[2]} m)', m[1], foto='tubo-pvc')
    elif m := re.match(r'CODO (M-H|H-H) (\d+)º (\d+)$', u) or re.match(r'CODO (M-H|H-H) (\d+)\S* (\d+)$', u):
        put(ref, E, 'Codos', f'Codo PVC {m[2]}º {m[1]} Ø{m[3]}', f'Codo PVC {m[2]}º {m[1]}', m[3], foto='codo45-pvc' if m[2] == '45' else 'codo-pvc')
    elif m := re.match(r'DERIVACION S (\d+)\S* M-H (\d+)', u):
        put(ref, E, 'Derivaciones e injertos', f'Derivación PVC {m[1]}º M-H Ø{m[2]}', f'Derivación PVC {m[1]}º M-H', m[2], foto='derivacion-pvc')
    elif ref in ('0935010164', '0935005931', '0935005962'):
        put(ref, E, 'Derivaciones e injertos', nm, foto='derivacion-pvc')
    elif (m := re.match(r'MANGUITO HH (\d+)$', u)) and ref.startswith('MA'):
        put(ref, E, 'Manguitos y reducciones', f'Manguito PVC H-H Ø{m[1]}', 'Manguito PVC H-H', m[1], foto='manguito-pvc')
    elif m := re.match(r'REDUCCION (EXCENTRICA M-H|CONCENTRICA H-M) (?:D\.)?(\d+)-(\d+)', u):
        t = 'Reducción PVC excéntrica M-H' if m[1].startswith('EXC') else 'Reducción PVC concéntrica H-M'
        put(ref, E, 'Manguitos y reducciones', f'{t} {m[2]}-{m[3]}', t, f'{m[2]}-{m[3]}', o=num(m[2]) * 1000 + num(m[3]), foto='manguito-pvc')
    elif m := re.match(r'TAPON CIEGO MACHO (\d+)', u):
        put(ref, E, 'Tapones', f'Tapón ciego macho PVC Ø{m[1]}', 'Tapón ciego macho PVC', str(int(m[1])), foto='tapon-pvc')
    elif m := re.match(r'TAPON (REDUCTOR MACHO D|REDUCCION S) (\d+)-(\d+)', u):
        put(ref, E, 'Tapones', f'Tapón reductor macho PVC {m[2]}-{m[3]}', 'Tapón reductor macho PVC', f'{m[2]}-{m[3]}',
            o=num(m[2]) * 1000 + num(m[3]), foto='tapon-pvc')
    elif m := re.match(r'TAPON REGISTRO (\d+)', u):
        put(ref, E, 'Tapones', f'Tapón de registro PVC Ø{m[1]}', 'Tapón de registro PVC', m[1], foto='tapon-pvc')
    elif ref in ('$0385', 'T1105040', 'T1255040'):
        put(ref, E, 'Tapones', nm, foto='tapon-pvc')
    # ── PP-R (Serie 7)
    elif m := re.match(r'(MANGUITO|TE 90º|CODO 90º|TAPON) SERIE 7 (\d+)MM', d.upper()):
        tipo = {'MANGUITO': 'Manguito', 'TE 90º': 'Te 90º', 'CODO 90º': 'Codo 90º', 'TAPON': 'Tapón'}[m[1]]
        put(ref, M, 'PP-R termofusión (serie 7)', f'{tipo} PP-R Ø{m[2]}', f'{tipo} PP-R termofusión', m[2])
    elif ref in ('PTM825', 'PTM820'):
        mm, p = ('25', '3/4"') if ref == 'PTM825' else ('20', '1/2"')
        put(ref, M, 'PP-R termofusión (serie 7)', f'Te mixta PP-R Ø{mm} × {p} hembra', 'Te mixta PP-R (rosca hembra)', f'{mm}×{p}')
    elif ref == 'PE920':
        put(ref, M, 'PP-R termofusión (serie 7)', 'Enlace mixto PP-R Ø20 × 1/2" macho')
    elif ref == 'PEML50112':
        put(ref, M, 'PP-R termofusión (serie 7)', 'Enlace PP-R Ø50 × rosca macho latón 1 1/2"')
    # ── Agua y acometidas
    elif ref in ('PVCR40', '0385720721', '0935000607', '0935000776', '0935001599', '0935010041'):
        put(ref, A, 'PVC presión e hidrotubo', nm, foto='hidrotubo' if ref == 'PVCR40' else 'pvc-presion')
    elif m := re.match(r'M\.TUBO PVC ENCOLAR PRESION PN16 (\d+)', u):
        put(ref, A, 'PVC presión e hidrotubo', f'Tubo PVC presión encolar 16 atm Ø{m[1]} (m)', 'Tubo PVC presión encolar 16 atm (m)', m[1], foto='pvc-presion')
    elif m := re.match(r'MT\. P\.BD PE-40 (\d+) 10ATM ALIME', u):
        put(ref, A, 'Tubo de polietileno', f'Polietileno alimentario 10 atm Ø{m[1]} (m)', 'Polietileno alimentario 10 atm, baja densidad (m)', m[1], foto='polietileno')
    elif ref in ('PE020', 'PE025', '0385703564', 'PE110040', 'PAG10025'):
        put(ref, A, 'Tubo de polietileno', nm, foto='polietileno')
    elif m := re.match(r'M\.POLIETILENO PE100 PN16 (\d+)', u):
        put(ref, A, 'Tubo de polietileno', f'Polietileno PE100 16 atm Ø{m[1]} (m)', 'Polietileno PE100 16 atm, alta densidad (m)', m[1], foto='polietileno')
    elif m := re.match(r'MT\. P\.BD PE-40 (\d+) 6ATM AGRIC', u):
        put(ref, A, 'Tubo de polietileno', f'Polietileno agrícola 6 atm Ø{m[1]} (m)', 'Polietileno agrícola 6 atm (m)', m[1], foto='polietileno')
    elif 'P/TUBO PE' in u:
        m = re.search(r'([\d./]+)"?X(\d+) P/TUBO PE', u)
        s = re.search(r' (\d+) P/TUBO PE', u)
        base = re.sub(r' (LATON|H|MACHO|HEMBRA)$', '', u.split(' LATON')[0])
        if u.startswith('RACOR MACHO'): t = 'Racor latón para PE, rosca macho'
        elif u.startswith('RACOR HEMBRA'): t = 'Racor latón para PE, rosca hembra'
        elif u.startswith('MANGUITO'): t = 'Manguito latón para PE'
        elif u.startswith('CODO PLACA'): t = 'Codo placa latón para PE (rosca hembra)'
        elif u.startswith('CODO MACHO'): t = 'Codo latón para PE, rosca macho'
        elif u.startswith('CODO HEMBRA'): t = 'Codo latón para PE, rosca hembra'
        elif u.startswith('CODO'): t = 'Codo latón para PE'
        elif u.startswith('TE HEMBRA'): t = 'Te latón para PE, rosca hembra'
        else: t = 'Te latón para PE'
        if m:
            p = pulg(m[1])
            med = f'{m[2]}×{p}'
            o = num(m[2])
        else:
            med = s[1]; o = num(med)
        put(ref, A, 'Racores de latón para polietileno', f'{t} Ø{med.replace("×", " × ")}', t, med, o=o, foto='racor-laton-pe')
    elif m := re.match(r'COLLARIN TOMA ([\d /]+?) DN(\d+)', u):
        p = pulg(m[1].strip().replace(' ', ' '))
        put(ref, A, 'Collarines de toma', f'Collarín de toma DN{m[2]} salida {p}', 'Collarín de toma (tubo DN × salida)', f'DN{m[2]}×{p}',
            o=num(m[2]) * 10 + valor_pulg(p))
    elif ref == '240300050':
        put(ref, A, 'Collarines de toma', 'Collarín de toma de fundición para PVC/PE DN50 × 3/4"')
    elif ref in ('$4128', '00100222', '00100555', '1111010007', '1111009995', '1111009988', 'E1000112', 'E1000034'):
        foto = {'$4128': 'grupo-presion', '00100222': 'bomba'}.get(ref)
        g = 'Bombas y grupos de presión' if ref in ('$4128', '00100222', '00100555') else 'Pozo: retención y filtros'
        if ref.startswith('11110'):
            p = {'1111010007': '2"', '1111009995': '1 1/2"', '1111009988': '1 1/4"'}[ref]
            put(ref, A, g, nm, 'Filtro de aspiración inox (válvula de pie)', p)
        elif ref.startswith('E1000'):
            put(ref, A, g, nm, 'Válvula de retención Europa', {'E1000112': '1 1/2"', 'E1000034': '3/4"'}[ref])
        else:
            put(ref, A, g, nm, foto=foto)
    # ── Cobre
    elif m := re.match(r'METRO BARRA (\d+)', u):
        put(ref, C, 'Tubo de cobre', f'Tubo de cobre en barra Ø{m[1]} (m)', 'Tubo de cobre en barra (m)', m[1], foto='tubo-cobre')
    elif ref == 'CUR15':
        put(ref, C, 'Tubo de cobre', nm, foto='tubo-cobre')
    elif m := re.match(r'CODO 90º (H CU|HH) (\d+)', d.upper()) or re.match(r'CODO 90º (MH) (\d+)', d.upper()):
        if ref.startswith('CU09'):
            mh = m[1] == 'MH'
            t = f'Codo 90º cobre {"M-H" if mh else "H-H"} (soldar)'
            put(ref, C, 'Codos y curvas', f'{t.replace(" (soldar)", "")} Ø{m[2]}', t, m[2], foto='accesorio-cobre')
        else:
            raise SystemExit(f'sin regla {ref} {d}')
    elif m := re.match(r'CURVA (90|45)º H (?:CU )?(\d+)', d.upper()) or re.match(r'CURVA COBRE (90|45) \S+ H-H (\d+)', u):
        t = f'Curva {m[1]}º cobre H-H (soldar)'
        put(ref, C, 'Codos y curvas', f'Curva {m[1]}º cobre H-H Ø{m[2]}', t, m[2], foto='accesorio-cobre')
    elif (m := re.match(r'MANGUITO HH (\d+)$', u)) and ref.startswith('CU27'):
        put(ref, C, 'Manguitos, tes y reducciones', f'Manguito cobre H-H Ø{m[1]}', 'Manguito cobre H-H (soldar)', m[1], foto='accesorio-cobre')
    elif m := re.match(r'TE (\d+)$', u):
        put(ref, C, 'Manguitos, tes y reducciones', f'Te cobre Ø{m[1]}', 'Te cobre (soldar)', m[1], foto='accesorio-cobre')
    elif m := re.match(r'REDUCCION CU (\d+)-(\d+) (HH|MH)', u) or re.match(r'MANGUITO REDUCIDO COBRE (M-H) .*CU (\d+)-(\d+)', u):
        if u.startswith('MANGUITO'):
            a1, a2, k = m[2], m[3], 'MH'
        else:
            a1, a2, k = m[1], m[2], m[3]
        t = f'Reducción cobre {"H-H" if k == "HH" else "M-H"} (soldar)'
        put(ref, C, 'Manguitos, tes y reducciones', f'{t.replace(" (soldar)", "")} {a1}-{a2}', t, f'{a1}-{a2}', o=num(a1) * 100 + num(a2), foto='accesorio-cobre')
    elif m := re.match(r'ENTRONQUE (\d+)X([\d./]+)´? (M|H)', u):
        p = pulg(m[2])
        t = f'Entronque cobre-rosca {"macho" if m[3] == "M" else "hembra"} (soldar)'
        put(ref, C, 'Paso de cobre a rosca', f'Entronque cobre {m[1]} × {p} {"macho" if m[3] == "M" else "hembra"}', t, f'{m[1]}×{p}', o=num(m[1]))
    elif ref in ('CU8306', 'BR09608', 'BR34112'):
        put(ref, C, 'Paso de cobre a rosca', nm)
    elif ref in ('0434034924', '0434035105', '0434034931', 'C30303', 'C30203', 'C30104', 'C30307', '0638052569'):
        nombres = {'0434034924': ('Manguito compresión macho 1/2" × 16', 'Manguito de compresión rosca macho', '1/2"×16'),
                   '0434035105': ('Manguito de compresión 16-16', 'Manguito de compresión (unión)', '16'),
                   '0434034931': ('Manguito compresión hembra 1/2" × 16', 'Manguito de compresión rosca hembra', '1/2"×16'),
                   'C30303': ('Manguito compresión hembra 1/2" × 12', 'Manguito de compresión rosca hembra', '1/2"×12'),
                   'C30203': ('Manguito compresión macho 1/2" × 12', 'Manguito de compresión rosca macho', '1/2"×12'),
                   'C30104': ('Manguito de compresión 18-18', 'Manguito de compresión (unión)', '18'),
                   'C30307': ('Manguito compresión hembra 3/4" × 22', 'Manguito de compresión rosca hembra', '3/4"×22'),
                   '0638052569': ('Enlace de compresión 1/2" × 15 (serie NT/200)', None, None)}
        n, t, med = nombres[ref]
        o = num(re.findall(r'\d+', med)[-1]) if med else None
        put(ref, C, 'Racores de compresión (cobre / multicapa)', n, t, med, o=o)
    elif m := re.match(r'TAPAPOROS (\d+)$', u):
        put(ref, C, 'Reparación de tuberías', f'Abrazadera tapaporos para cobre Ø{m[1]}', 'Abrazadera tapaporos para cobre', m[1])
    elif m := re.match(r'GEBO TAPAPOROS CORTO ([\d./]+)', u):
        p = pulg(m[1])
        put(ref, C, 'Reparación de tuberías', f'Abrazadera de reparación Gebo corta {p} (hierro)', 'Abrazadera de reparación Gebo corta (tubo de hierro)', p)
    elif ref == 'GE01003':
        put(ref, C, 'Reparación de tuberías', 'Terminal Gebo 3/4" macho (tubo de hierro)')
    # ── Latón roscado
    elif m := re.match(r'MAMELON ([\d./ ]+?)[´"]*\s*M M', u) or re.match(r'MACHON DOBLE LATON ([\d ./]+)"$', u):
        p = pulg(m[1].strip())
        put(ref, L, 'Machones y reducciones', f'Machón doble (mamelón) latón {p}', 'Machón doble / mamelón (macho-macho)', p)
    elif m := re.match(r'MAMELON REDUCIDO ([\d./]+)´ ([\d./]+)´', u) or re.match(r'MACHON DOBLE REDUCIDO LATON ([\d ./]+)"X([\d ./]+)"', u):
        a1, a2 = pulg(m[1]), pulg(m[2])
        put(ref, L, 'Machones y reducciones', f'Machón reducido latón {a1} × {a2}', 'Machón reducido (macho-macho)', f'{a1}×{a2}', o=valor_pulg(a1) * 10 + valor_pulg(a2))
    elif ref == '0766002072':
        put(ref, L, 'Machones y reducciones', nm)
    elif m := re.match(r'REDUCCION LATON M-H ([\d ./]+)"-([\d ./]+)"', u) or re.match(r'REDUCCION ([\d./]+)´?\s*X\s*([\d./]+)´', u):
        a1, a2 = pulg(m[1]), pulg(m[2])
        put(ref, L, 'Machones y reducciones', f'Reducción latón M-H {a1} × {a2}', 'Reducción latón macho-hembra (grande × pequeña)', f'{a1}×{a2}',
            o=valor_pulg(a1) * 10 + valor_pulg(a2))
    elif m := re.match(r'MARSELLA REDUCID[OA] ([\d ./]+)´?M-([\d ./]+)´?H', u):
        a1, a2 = pulg(m[1].strip()), pulg(m[2].strip())
        put(ref, L, 'Machones y reducciones', f'Marsella reducida {a1} macho × {a2} hembra', 'Marsella reducida (macho pequeña × hembra grande)', f'{a1}×{a2}',
            o=valor_pulg(a1) * 10 + valor_pulg(a2))
    elif ref == '1111000800':
        put(ref, L, 'Machones y reducciones', nm, 'Marsella reducida (macho pequeña × hembra grande)', '1/8"×1/4"', o=0.1)
    elif m := re.match(r'TE H-H-H ([\d./]+)´', u) or re.match(r'TE LATON (?:REFORZADO )?([\d ./]+)"', u):
        p = pulg(m[1])
        put(ref, L, 'Codos, tes y manguitos', f'Te latón H-H-H {p}', 'Te latón H-H-H', p, foto='laton')
    elif m := re.match(r'CODO ([\d./]+)´ 90º (HH|MH)', u):
        p = pulg(m[1])
        t = f'Codo latón 90º {"H-H" if m[2] == "HH" else "M-H"}'
        put(ref, L, 'Codos, tes y manguitos', f'{t} {p}{" reforzado" if "REF" in u else ""}', t, p)
    elif ref == 'M380201':
        put(ref, L, 'Codos, tes y manguitos', nm)
    elif m := re.match(r'TAPON ([\d./]+)[´"]* (MACHO|HEMBRA)', u):
        p = pulg(m[1])
        if 'CROMADO' in u:
            put(ref, L, 'Tapones', nm, foto='laton')
        else:
            put(ref, L, 'Tapones', f'Tapón latón {m[2].lower()} {p}', f'Tapón latón {m[2].lower()}', p, foto='laton')
    elif ref in ('M452942', 'M342100'):
        put(ref, L, 'Racores', nm, foto='laton')
    elif m := re.match(r'JUNTA PNA\.(ESTR|ANCHA)[. ]P/RAC\.([\d./]+)"', u):
        p = pulg(m[2])
        t = f'Junta plana {"estrecha" if m[1] == "ESTR" else "ancha"} para racor'
        put(ref, L, 'Juntas', f'{t} {p}', t, p)
    elif m := re.match(r'JGO\.JTA\.KLINGERI ([\d./]+)" (\S+)', u):
        med = re.sub(r'X', '×', m[2].split('X2')[0].split('(')[0])
        put(ref, L, 'Juntas', f'Juntas Klingerit {m[1]}" {med} (10 u.)', 'Juntas de fibra Klingerit (10 u.)', f'{m[1]}" {med}', o=valor_pulg(m[1]) + num(med.split('×')[-1]) / 100)
    elif ref in ('GL11081', '0638053149', '0913006076'):
        put(ref, L, 'Juntas', nm)
    elif ref == '0638056929':
        put(ref, K, 'Radiadores y sus válvulas', nm, foto='radiador')
    # ── Llaves y válvulas
    elif m := re.match(r'LATIGUILLO (?:3/4-3/4 HH L )?(\d+)MM SUPER', u) or re.match(r'LATIGUILLO 3/4-3/4 HH L (\d+)MM SUPER', u):
        put(ref, V, 'Latiguillos, flexos y alargos', f'Latiguillo 3/4"-3/4" H-H {m[1]} mm (super)', 'Latiguillo 3/4"-3/4" H-H (super), largo', f'{m[1]} mm', o=num(m[1]), foto='latiguillo')
    elif ref in ('0230H12H12', '0650H1', 'AC57024', 'AC57012', 'AC57013', 'POVAL0530', 'RE01034', '1111013718'):
        put(ref, V, 'Latiguillos, flexos y alargos', nm, foto='latiguillo' if 'LATIG' in u else None)
    elif ref in ('1111001661', '1111001647'):
        put(ref, V, 'Latiguillos, flexos y alargos', nm, 'Alargo de grifo M-H 1/2" cromado', '50 mm' if ref.endswith('47') else '100 mm',
            o=50 if ref.endswith('47') else 100)
    elif m := re.match(r'LLAVE BOLA ([\d./]+)" H', u):
        p = pulg(m[1])
        put(ref, V, 'Llaves de paso', f'Llave de bola H-H {p}', 'Llave de bola H-H (palanca)', p, foto='llave-paso')
    elif m := re.match(r'VALVULA ESFERA CHICAGO ([\d./]+)" ROSCAR', u):
        p = pulg(m[1])
        put(ref, V, 'Llaves de paso', f'Válvula de esfera Chicago H-H {p}', 'Válvula de esfera Chicago H-H', p, foto='llave-paso')
    elif ref in ('CC99004', 'AC03027', '0766010718', '0766011012', '0638051479', '0766002483', '0313040634'):
        put(ref, V, 'Llaves de paso', nm, foto='llave-paso' if ref != '0313040634' else None)
    elif ref in ('AC03066', '0758004421', '0758114134', 'AC03069', 'RE01032'):
        put(ref, V, 'Llaves de escuadra y de lavadora', nm)
    elif ref in ('$0382', '0347006049'):
        put(ref, V, 'Reductoras y filtros', nm, foto='reductora' if ref == '0347006049' else None)
    elif ref in ('0750039320', '0750001552', 'VV01001', '1010004364', 'SI01008', 'AR019', 'SI01002'):
        put(ref, B, 'Válvulas de desagüe y sifones', nm, foto='sifon' if 'SIF' in u else None)
    # ── Gas
    elif ref in ('GL11001', 'GN05061', '0490002778', 'GL10071', 'GN06032', 'GN06123', 'GN06019', 'GN06122', 'GN06121', 'GL11022'):
        put(ref, G, 'Gas butano y propano', nm, foto='manguera-gas' if ref in ('0490002778', 'GL10071') else None)
    # ── Multicapa e inox
    elif sub == 'Multicapa':
        n = nm or bon(d.lower().replace('lin.press', 'press').replace('valv.esf.', 'válvula esfera ').replace(' h ', ' hembra ')
                       .replace('racor fijo m r.conica', 'racor fijo macho rosca cónica').replace('d.', 'Ø'))
        put(ref, M, 'Multicapa', n, foto='multicapa')
    elif sub == 'Prensa inox':
        n = nm or bon(d.lower().replace(' filpress', '').replace('d.', 'Ø').replace(' h ', ' hembra ').replace('h-m', 'H-M')) + ' (inox prensar)'
        put(ref, M, 'Inox prensar (Filpress)', n)
    # ── Termos y agua caliente
    elif sub == 'Acumuladores':
        put(ref, T, 'Acumuladores', nm, foto='acumulador')
    elif sub.startswith('Termos'):
        put(ref, T, 'Termos eléctricos', nm, foto='termo')
    elif sub.startswith('Calentadores'):
        put(ref, T, 'Calentadores de gas', nm, foto='calentador')
    elif ref in ('AC94304', '0382000133', '0382076455', '0382006971', 'AC94302', 'TS-TERM', '0382002928', '28365000', '24559000', 'AC02051', '0425006321'):
        put(ref, T, 'Recambios y seguridad de termos', nm, foto='vaso-expansion' if ref == '24559000' else None)
    # ── Calefacción
    elif ref in ('0373022673', '0638005083'):
        put(ref, K, 'Circuladores', nm, foto='circulador')
    elif ref in ('0638054831', 'FR72052', 'AC03142', 'AC03121', '0433003268', '0433000366', '0638051599', 'AC06011', '0638056254'):
        put(ref, K, 'Radiadores y sus válvulas', nm, foto='radiador' if ref in ('0638054831', 'FR72052') else None)
    elif ref.startswith('FIG02') or ref == '1177047417':
        put(ref, K, 'Salida de humos de caldera 60/100', nm)
    elif ref in ('16922000', '51100014', '51100215', 'AC16065', '27909000', 'AC05052', '0382000552'):
        put(ref, K, 'Vasos de expansión y seguridad', nm, foto='vaso-expansion' if 'VASO' in u and 'SOPORTE' not in u else None)
    elif ref in ('0638055871', '0638057868', 'AC12002', 'AC12006', 'AC13067', 'AC13064', '6790005'):
        put(ref, K, 'Termostatos, manómetros y vainas', nm)
    elif ref == 'AC09051' or u.startswith('BOQUILLA QUEMADOR'):
        if ref == 'AC09051':
            put(ref, K, 'Gasoil', nm)
        else:
            m = re.match(r'BOQUILLA QUEMADOR (\d\.\d+) G/H', u)
            put(ref, K, 'Gasoil', f'Boquilla de quemador Danfoss {m[1].replace(".", ",")} G/H 60º', 'Boquilla de quemador Danfoss 60º (G/H)',
                m[1].replace('.', ','), o=num(m[1]))
    # ── Chimeneas
    elif sub == 'Estufas':
        put(ref, H, 'Estufas', nm, foto='estufa-pellet' if 'PELLET' in u or ref == '$4016' else 'estufa-lena')
    elif m := re.match(r'(MODULO RECTO MEDIO|MODULO RECTO|CODO 45\S|SOMBRERETE|ANCLAJE REGULABLE CORTO) DP (?:316L/304|304) (?:D\.|DIAMETRO |DIÁMETRO )?(\d+)', u):
        tipo = {'MODULO RECTO MEDIO': 'Módulo recto medio', 'MODULO RECTO': 'Módulo recto', 'SOMBRERETE': 'Sombrerete',
                'ANCLAJE REGULABLE CORTO': 'Anclaje regulable corto'}.get(m[1], 'Codo 45º')
        g = 'Anclajes y abrazaderas' if tipo.startswith('Anclaje') else 'Tubo inox doble pared'
        put(ref, H, g, f'{tipo} doble pared Ø{m[2]}', f'{tipo} doble pared', m[2], foto=None if g.startswith('Anclajes') else ('sombrerete' if tipo == 'Sombrerete' else 'tubo-dp'))
    elif m := re.match(r'MODULO RECTO SW 316L D\.(\d+)', u):
        put(ref, H, 'Tubo inox pared simple', f'Módulo recto pared simple Ø{m[1]}', 'Módulo recto pared simple', m[1], foto='tubo-sw')
    elif ref in ('1177011555', '1177006308', '1177006186', '1177006148', '03011512B'):
        put(ref, H, 'Tubo inox doble pared', nm, foto='sombrerete' if 'SOMBR' in u else 'tubo-dp')
    elif ref in ('1177032840', '1177003300', '1177032048', '1177001455', '1177035100', '1177033090'):
        put(ref, H, 'Tubo inox pared simple', nm, foto='sombrerete' if 'SOMBR' in u else 'tubo-sw')
    elif ref in ('1177038583', '1177031836', '1177008883'):
        put(ref, H, 'Anclajes y abrazaderas', nm, foto='abrazadera-chimenea' if 'ABRAZ' in u else None)
    elif ref in ('RE15RB80', '0676018121', 'POVAL0510', 'SU2040', 'SU2050'):
        put(ref, H, 'Ventilación y tubo flexible', nm)
    # ── Canalón
    elif sub == 'Canalón PVC':
        put(ref, NC, 'Canalón PVC gris', nm, foto='canalon' if 'TRAMO' in u else 'canalon-accesorio')
    # ── Baño
    elif ref in ('FO02015', '0750014965', 'FO02014', '0755521984', '0755529065', 'AC42091'):
        put(ref, B, 'Cisternas y mecanismos', nm, foto='mecanismo-cisterna' if 'MECANISMO' in nm.upper() or 'KIT' in nm.upper() else ('flotador' if 'FLOTADOR' in nm.upper() else None))
    elif m := re.match(r'FLOTADOR V\.ROSCADA ([\d./]+)´', u):
        p = pulg(m[1])
        put(ref, B, 'Cisternas y mecanismos', f'Grifo flotador rosca {p}', 'Grifo flotador roscado', p, foto='flotador')
    elif ref in ('0740000433',):
        put(ref, B, 'Ducha', nm, foto='telefono-ducha')
    elif ref in ('SI01013', 'SI01018', '0501002303', 'FO01017'):
        put(ref, B, 'Inodoro y lavabo: fijaciones y juntas', nm)
    # ── Gas, sellado, soldadura
    elif ref in ('AC18008', 'AC18001', 'AC18019', 'AC18101', 'AC79305', '1270051', 'AC96011', '0863002720'):
        put(ref, G, 'Soldadura de cobre', nm, foto={'AC79305': 'desincrustante', '1270051': 'desincrustante', 'AC96011': 'gas-mapp'}.get(ref))
    elif ref in ('01330205', '505018', 'AC18015', '0863002973', 'AC18021', 'AC18023'):
        put(ref, G, 'Sellado de roscas', nm, foto='teflon' if ref in ('01330205', '505018') else None)
    elif ref in ('AC96038', '505529', '504808'):
        put(ref, G, 'Siliconas, masillas y espuma', nm, foto={'AC96038': 'masilla', '504808': 'espuma'}.get(ref))
    # ── Fijación, aislamiento, herramienta
    elif m := re.match(r'FIJAS? (S|D) (\d+) PP', u):
        t = f'Grapa fijatubos {"simple" if m[1] == "S" else "doble"} PP'
        put(ref, X, 'Fijación de tuberías', f'{t} Ø{m[2]}', t, m[2], foto=None)
    elif ref in ('$0481', '0481000254', 'SP00U', '0319000497', '0065018527', '0102000295', '0501001676', '0065035739', '0065002359'):
        put(ref, X, 'Fijación de tuberías', nm, foto='abrazadera' if 'isof' in nm.lower() else ('soporte-perforado' if ref == '$0481' else None))
    elif m := re.match(r'(?:M\. )?TUBO COARRUG\.(ROJO|AZUL) (\d+)', u):
        t = f'Vaina corrugada {m[1].lower()} para tubo empotrado ({"caliente" if m[1] == "ROJO" else "fría"})'
        put(ref, X, 'Aislamiento y vaina de tuberías', f'Vaina corrugada {m[1].lower()} Ø{m[2]} (m)', t, m[2])
    elif ref in ('1010002674', '0435003580', '0435003550', 'AI501'):
        put(ref, X, 'Aislamiento y vaina de tuberías', nm)
    elif sub == 'Herramienta':
        put(ref, X, 'Herramienta', nm, foto={'0896025656': 'cortatubos', 'AC79543': 'sierra'}.get(ref, 'broca-sds'))
    elif ref == '1111':
        put(ref, X, 'Otros', nm)
    # Duplicado de «Varios» del codo placa para PE
    elif ref == 'INC':
        put(ref, A, 'Racores de latón para polietileno', 'Codo placa latón para PE Ø20 × 1/2" (otra referencia)', foto='racor-laton-pe')
    else:
        print('SIN CLASIFICAR', ref, '|', d, '|', sub)

faltan = [a for a in arts if a[0] not in out]
print('clasificados', len(out), 'de', len(arts), 'faltan', len(faltan))
for a in out.values():
    assert a['n'], a
# Foto de referencia por grupo cuando la pieza no tiene una propia (piezas de latón: la foto de una pieza de latón)
FOTO_GRUPO = {(L, 'Codos, tes y manguitos'): 'laton', (L, 'Machones y reducciones'): 'laton', (L, 'Tapones'): 'laton',
              (L, 'Racores'): 'laton', (C, 'Paso de cobre a rosca'): 'laton', (C, 'Racores de compresión (cobre / multicapa)'): 'laton',
              (M, 'Multicapa'): 'multicapa', (V, 'Llaves de paso'): 'llave-paso'}
for ref, a in out.items():
    t = (a['t'] or a['n'])
    if a['f'] == L and not a['foto']:
        if t.startswith('Machón'): a['foto'] = 'machon'
        elif t.startswith('Reducción latón'): a['foto'] = 'reduccion-laton'
        elif t.startswith('Marsella') or t.startswith('Alargadera'): a['foto'] = 'marsella'
        elif t.startswith('Codo latón'): a['foto'] = ''  # sin foto fiel: la pegatina
    if a['foto'] is None and ref != '0313040634':
        a['foto'] = FOTO_GRUPO.get((a['f'], a['g']))
for a in out.values():
    assert a['g'] in GRUPOS[a['f']], a
json.dump({'familias': ORDEN_FAM, 'grupos': GRUPOS, 'articulos': out}, open(sys.argv[1] if len(sys.argv) > 1 else f'{N}/zabaleta_catalogo.json', 'w'),
          ensure_ascii=False, indent=0)
