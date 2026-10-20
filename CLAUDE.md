# Casa Fonso · app interna — instrucciones para trabajar en este repo

Léelo entero antes de tocar nada. Es la memoria común entre sesiones.

## Qué es y quién la usa
App web interna de **Casa Fonso** (materiales de construcción, Boal/Villayón, Asturias; dueño: Andrés).
Gestiona: albaranes de proveedor (lectura con IA, precios, etiquetas, listín, TreyFACT),
firma de albaranes de venta, reparto, turnos, reparaciones, pedidos a proveedor para clientes,
consulta de precios, catálogo, órdenes de carga, avisos push y copias en Drive.

Usuarios (poco técnicos — todo debe entenderse sin explicación):
- **Andrés** — encargado/dueño, rol `admin`.
- **Patricia** — caja/oficina, rol `tienda` (usa mucho el **ordenador**).
- **Oscar** — tienda, rol `tienda`.
- **Melchor** — camionero, rol `reparto` (solo móvil, a menudo sin cobertura).
- **Manolo** — tío de Andrés, dueño que se está retirando, rol `consulta`: solo **ver** tarifas y vencimientos,
  sin cambiar nada (vista propia `ConsultaShell` en `App.tsx` + `pages/ConsultaInicio.tsx`, estilos en `pages/consulta.css`).
  Backend: lista blanca `_CONSULTA` en `main.py` (GET de tarifas y vencimientos, y «volver a leer» la tarifa);
  `puede_ver` en `api/tarifas.py` y `api/vencimientos.py` (admin y consulta); los ajustes de vencimientos, solo admin.
  Sin avisos push por ahora. Su código lo pone Andrés desde «Códigos».
  **No ve la tarifa de piensos** (Andrés, 20/10/2026): `"ocultar_a": ("consulta",)` en `TARIFAS` → `ts.oculta()`; la lista
  (`resumen(rol=…)`) no la trae y `_prov` da 404, así que tampoco sale en su búsqueda. Para ocultarle otra, lo mismo.

## Reglas de la casa
1. **Móvil y ordenador van a la par.** En la oficina se usa mucho el ordenador: todo tiene que estar
   igual de cuidado, rápido y fácil en escritorio (1280 px y más) que en móvil (390 px y 320 px).
   Cada cambio se prueba en los dos tamaños antes de publicar.
2. **Lo nuevo va primero «En pruebas»**: solo visible con el código de Andrés (rol admin; grupo
   «En pruebas» del menú en `App.tsx`, rutas protegidas). Se pasa al resto cuando Andrés lo aprueba.
3. **Textos en español sencillo**, sin jerga técnica ni mensajes en inglés. Errores que digan qué hacer.
4. **Sin cobertura**: firmas y cargas funcionan offline (colas en `lib/offline.ts` y
   `lib/offlineCargas.ts`, service worker `public/sw.js`). No romper eso; nada se pierde en silencio.
5. **Repo público**: nunca secretos en el código ni en commits (claves, códigos de acceso,
   MAIL_RELAY_KEY). Viven solo en variables de entorno de Railway.
6. **Seguridad por rol en el backend**, no solo ocultando botones (middleware en `backend/app/main.py`;
   reparto tiene lista blanca `_REPARTO_FIRMAS`; `solo_encargado` en `app/api/turnos.py`).
7. Dar opinión sincera a Andrés; no decir a todo que sí. Respuestas breves y en español.

## Estilo visual
- Marca: verdes `#2FAE66` / `#1F5A3A` / `#123A26`, grafito `#1A1A1A`, fondo `#F2F4F0`;
  fuentes Oswald (títulos) y Montserrat. Tokens en `frontend/src/theme.css`.
- Lema siempre «Materiales de construcción».
- **Dibujos estilo «pegatina»**: vector plano a dos tonos, sin contornos, borde blanco recortado y
  sombra suave (`components/Pegatinas.tsx`: `Ilustracion`, `Sello`, `CamionPegatina`, `Vacio`,
  `AccesoPegatina`). Solo para momentos (firmar, vacíos, avisos buenos, sin cobertura, reparto,
  accesos rápidos de Inicio), **nunca** en iconos de botones o menús (ahí: lucide-react).
- Camión de la marca: cabina blanca, franjas verdes en diagonal, grúa roja, logo en la puerta
  (`components/camionCuerpo.ts`). Animación de arranque en móvil: `components/CabeceraPegatina.tsx`.
- Sorpresas del arranque (todos los usuarios desde el 10/10/2026): `components/sorpresas.ts` (elección y animaciones), motor común en
  `components/pegatinaMotor.ts` (`montar` expone `ponLogo`, `pelar`, `ponCamion`), piezas de dibujo en
  `components/sorpresasEscena.ts` (generado con `tools/sorpresas-escena.py`) y `huevoCarga.ts`. Hay seis: carga (se cae el palé),
  grúa (la pluma telescópica coge el logo por la esquina), pala (tiembla, el logo cae y lo tapa de arena; cazo grande),
  carretilla (mástil telescópico lo descuelga), pintor (lo tapa a rodillo, «Recién pintado») y orbayu (llueve, sopla y se
  lo lleva el viento). Andrés ve primero las no vistas, una por apertura (`cfSorpresasVistas` en localStorage); luego, y para los demás siempre, 1 de cada 10 al azar.
  Para ver una: abrir con `?sorpresa=<nombre>`. Todas salen por la derecha.
- Fiestas del arranque (todos los usuarios desde el 10/10/2026; `components/fiestas.ts`, piezas en `fiestasEscena.ts`): la animación normal
  vestida para la fecha, ~7 s: intro con fondo propio → llega el camión decorado y espera parado (`completa(t, parado)` del motor)
  → momento especial → despegue normal → pegatina final. Fechas en `fiestaDe()`: otoño (22 sep–20 dic), Halloween (31 oct),
  Navidad (20–30 dic), Nochevieja (31 dic–1 ene), Reyes (5–6 ene), Antroxu (dom–mar de Carnaval, calculado desde la Pascua),
  San Juan (23–24 jun), Día de Asturias (8 sep), cumpleaños (`CUMPLES`, vacío) y aniversario (`ANIVERSARIO`, null): faltan
  las fechas de Andrés. Las de uno a tres días salen la primera apertura de cada uno de esos días (`cfFiestaDia`); las de
  temporada (`TEMPORADAS`: otoño y Navidad) la primera vez y luego como mucho una vez por semana (`cfFiestaTemporada`,
  `DIAS_ENTRE`; cada día cansaba, Andrés 15/10/2026). Tienen prioridad sobre las sorpresas.
  Ver una: `?fiesta=<otono|halloween|navidad|nochevieja|reyes|antroxu|sanjuan|asturias|cumple|aniversario>` (`&nombre=` para cumple).

## Nombres de los apartados (13/10/2026, para no confundir)
- «Albaranes de compra» (`/albaranes`, abajo en el móvil «Compras»): los de proveedor que se leen con IA.
- «Albaranes de venta» (`/firmas`, abajo «Ventas»): los de TreyFACT a clientes; firmar, al camión, facturar.
- «Órdenes de carga» (`/cargas`) va en el grupo Clientes, debajo de los de venta.
- En «Albaranes de venta», al elegir un cliente salen sus **obras y referencias** como botones (campo `obra` del albarán,
  REFERENCIA de TreyFACT) y la lista se agrupa por obra; en «Por facturar» cada empresa se parte por obras, con PDF y
  «Facturar esta obra». Las que son la misma escrita distinto se juntan solas (`lib/obras.ts`: `agruparObras`, `mismaObra`:
  sin tildes ni signos, palabras vacías fuera, abreviaturas, letras cambiadas, misma calle y número). Solo en el navegador.
- Lectura de la obra en el PDF (`firma_service._obra`): en TreyFACT la etiqueta «OBRA /» + «REFERENCIA» va en dos renglones a
  la izquierda y el texto a su derecha, en uno o dos renglones (a menudo centrado entre los dos); se junta todo. El 13/10/2026
  se releyó la obra de todos los albaranes ya subidos (arreglo puntual `obra_v2` en `database.py`).

## Novedades y tutorial
- `components/Novedades.tsx`: aviso que sale una vez por dispositivo al abrir la app (clave `cfNovedadesVistas` = `VERSION`);
  para avisar de cosas nuevas, cambiar `VERSION` y la lista `COSAS`. Última: `2026-10-19` (tarifas para todos: Pladur, Dinak, ladrillos, gas,
  morteros y piensos; familias en lista; «Para qué sirve»; tarifas en la tableta).
- `components/Tutorial.tsx`: tutorial guiado con hueco de luz sobre cada botón (`PASOS`: ruta, selectores `data-tour`/clase,
  texto; si no encuentra el botón, el cartel sale en el centro). Se abre desde las Novedades o «Tutorial» del menú (`abrirTutorial`).
  Al cambiar pantallas, mantener los `data-tour` (`nav-*`, `subir-albaranes`, `filtro-cliente`, `nueva-carga`).

## Tu círculo (cuenta) y turnos en el móvil (13/10/2026)
- `components/MenuCuenta.tsx`: inicial en un círculo arriba a la derecha (cabecera del móvil e Inicio) y, en el ordenador, fila
  con nombre y turno de hoy al pie del menú lateral (`lateral`, la tarjeta va `fixed` para que no la recorte el menú).
  Tarjeta: turno de hoy, mañana y el siguiente día que trabaja (equipos de la tienda: «Tienda» y los turnos de hoy de todos),
  Mis turnos, avisos, Mi código, Códigos y Márgenes (admin), tutorial y cerrar sesión. Sustituye a los enlaces de sesión.
  Melchor también lo tiene en la cabecera del reparto (sin tutorial); su tarjeta de turno y sus enlaces de abajo se quitaron.
- Turnos de una persona: «Semana | Mes» (`vistaP`; móvil empieza en semana, ordenador en mes). Semana = un día por fila con
  el horario grande, se desliza para cambiar de semana y el encargado toca un día para cambiarlo. Mes en el móvil = rayita de
  color por tipo (`tcal-<tipo>`) en vez de texto. «Turnos» sigue también en el menú (decisión de Andrés, primer mes).

## Inicio (13/10/2026, simplificado)
- Orden: saludo + subir albaranes + círculo · 3 accesos (precio, reparación, pedido; «firmar» ya no, está en la tarjeta) ·
  correo / vencimientos / avisos solo si hay algo · tarjetas Por firmar, Por facturar, Cargas en curso y Pedidos sin completar
  (solo si hay) · franja «Hoy en la tienda» (`EnLaTienda` en `TurnoHoy.tsx`) · «Para no olvidar» solo si hay algo · «Hoy»
  agrupado por tipo (se despliega). Las reparaciones listas y pedidos llegados salen como «buenas noticias», no como tarjeta.

## Versión nueva y «Por facturar» plegable (13/10/2026)
- `components/NuevaVersion.tsx`: cada 5 min y al volver a la pestaña mira si el archivo principal de `/` ha cambiado y saca
  la barra «Hay una versión nueva · Actualizar» (los ordenadores de la tienda tienen la app abierta todo el día).
- «Por facturar»: cada cliente se pliega (los de más de 3 albaranes empiezan plegados salvo con un cliente elegido) y hay
  «Plegar todos / Desplegar todos» (`plegado` en `FirmasPage`).

## Estructura
- `backend/` FastAPI + SQLAlchemy + SQLite. Migraciones = lista de `ALTER TABLE` en `app/database.py`
  (los arreglos puntuales de datos también van ahí, ejecutándose una sola vez).
  API en `app/api/`, lógica en `app/services/`, PDFs con ReportLab, IA con Claude
  (`extraction_service`, `carga_service`).
- `frontend/` React + Vite + TypeScript. Páginas en `src/pages/`, cliente API en `src/api/client.ts`,
  rutas y menú en `src/App.tsx` (carga por partes con `React.lazy`). CSS: `index.css` (base),
  `theme.css` (tema), `estilos-b.css` y `estilos-c.css` (ajustes posteriores), `escritorio.css` (repaso del
  ordenador, oct. 2026: menú que cabe en 1366×768, tabla de artículos compacta por debajo de ~1180 px,
  original al lado del albarán desde 1600 px, panel de firma con el botón siempre a la vista). Utilidades en
  `src/lib/` (`texto.ts` búsqueda sin tildes/fechas/plurales, `descargas.ts`, `estados.ts`).
- **Tarifas de proveedor** (desde el 13/10/2026 para la tienda también: admin, tienda y consulta; en el menú, grupo Mostrador): `/tarifas` → proveedor → familia → medidas → ficha. Las tarifas siguen en
  Google Sheets (las actualizan las tareas programadas de Claude); la app las lee con la acción `hoja` del Apps Script
  (`tools/correo-casafonso.gs`, la hoja tiene que estar compartida con casafonsomc), guarda copia en `tarifa_copias`
  y apunta cada precio visto en `tarifa_precios` (evolución). Lector por proveedor en `services/tarifas_service.py`
  (`LECTORES`: Hierros Santander, Zabaleta, Isoltubex, Silva, Pladur y Dinak, ladrillos y las hojas de la tienda: gas, morteros, piensos; Zabaleta trae cada línea de factura en «Detalle facturas», así que la evolución y la factura exacta salen de ahí, y en la app se enseña con una organización propia: 14 familias, grupos, tipo de pieza con sus medidas y un nombre claro por referencia, en `backend/app/data/zabaleta_catalogo.json`, generado con `tools/zabaleta-clasifica.py`; las referencias nuevas salen en «Nuevos (sin ordenar)» de su familia hasta que se añaden al clasificador; sus PDF están en la carpeta NAVARRO ZABALETA del Drive de casafonsomc, `Zabaleta_AAAA-MM-DD_nº.pdf`); Isoltubex (oct. 2026; **para todos desde el 16/10/2026**, decisión de Andrés; la marca `en_pruebas` de `TARIFAS` — `_prov`/`resumen` en `api/tarifas.py` devuelven 404 / la ocultan al resto — ya no la lleva ninguna desde el 19/10/2026; se queda para lo nuevo que haya que probar): hoja «TARIFA_ISOLTUBEX_2026» `1JGwp…` (hay dos copias viejas de abril con el mismo nombre: no usarlas), una pestaña por tipo de accesorio + SIN_NETO_AVISO; sin facturas (el coste es el de sus listas de netos, mes en las notas de INICIO). Se ordena con reglas en `services/isoltubex.py` (9 familias, grupos, tipo de pieza, medida «16 × ½″» y nombre claro; las referencias nuevas caen solas). Fotos del catálogo oficial (isoltubex.net, catalogoIsoltubex2025.pdf) en `frontend/public/catalogo/iso/`, por referencia y por tipo en `backend/app/data/isoltubex_fotos.json`, generadas con `tools/isoltubex-fotos.py` (correcciones a mano en FORZAR / XREF_GRUPO / XREF_REF); pegatinas `st-iso-*`). Pegatinas en `frontend/public/catalogo/` (generadas con
  `tools/pegatinas-catalogo.py`); las fotos de referencia se enlazan desde Obramat/Leroy Merlin (`lib/tarifas.ts`),
  no se copian al repo. En el ordenador (≥1100 px) las medidas van en filas con un panel fijo a la derecha
  (precio, coste y factura sin salir de la lista); en móvil, barra flotante «Ver ficha». La búsqueda sale en tabla en el
  ordenador; «/» lleva al buscador e Intro abre el primero. La factura abre su PDF (acción `archivos` del Apps Script sobre la carpeta ALBARANES/<proveedor>); si no lo encuentra, busca el nº en Drive.
- **Mallas J. Silva Moreira (14/10/2026; para todos desde el 16/10/2026)**: hoja «TARIFA_SILVA_MOREIRA_2026» `1ROnV…` en Mi unidad
  de Andrés (compartida con casafonsomc). Pestañas INICIO (nº de pedido) y TARIFA: una fila por rollo (código, familia, gama,
  alto/alambres/separación, metros, rollos/palé, coste del pedido 520.42043 de may-26, margen, PVP, PVP+IVA, €/m, precio desde
  5 rollos y de palé, con y sin IVA). Márgenes sobre coste fila a fila en las celdas amarillas (L tarifa, T desde 5 rollos, U palé): ligera 100 m 40/30/20 %,
  ligera 50 m 45/30/20 %, fuerte y nudo fijo 35/25/15 % (decisión de Andrés, 14/10/2026). PVP a 0,10 €. `desde` en TARIFAS
  obliga a releer copias anteriores a esa hora (la primera hoja `1oIoL…` está en la papelera).
  Lector `leer_silva` en `tarifas_service.py`: familia → gama → «Rollo de N m» con las medidas en botones. Precios por cantidad
  en `escalas` (nombre, pvp, pvp_iva, margen; columnas P–S y T–U de la hoja): filas en el panel del ordenador, línea en la barra
  del móvil y caja «Precio por cantidad» en la ficha (`tf-escalas`); la barra del móvil de la vista de siempre (tienda y Manolo) también lo lleva. La fecha del pedido sale de INICIO («del dd/mm/aaaa»). Fotos oficiales de jsilvamoreira.pt (Ovimor L → ligera, Ovimor M → fuerte, Nodimor →
  nudo fijo) en `frontend/public/catalogo/silva/`, por familia (`foto` del lector y `fotoArticulo` en `lib/tarifas.ts`). También
  sustituyen a la pegatina de la familia (tarjetas, cabecera, buscador): `claveFamilia` devuelve `silva-*` y `pegatina()` da la foto;
  estilo con borde blanco en `tarifas.css` (`img[src^="/catalogo/silva/"]`).
- **Pladur y Dinak (Construdeco, 16/10/2026; para todos desde el 19/10/2026)**: lectores en `services/construdeco.py`
  (`leer_pladur`, `leer_dinak`). Hojas de Mi unidad de Andrés compartidas con casafonsomc: «tarifa_pladur_construdeco»
  `1IK8J…` y «TARIFA_DINAK_2024_2026» `1-Se5r…`; las actualizan las tareas de los miércoles y los jueves con los pedidos
  de Construdeco (carpeta CONSTRUDECO `1118ym…`; los PDF se llaman por la hora del escaneo, así que no se enlaza la factura:
  la ficha dice de dónde sale el coste). `pestanas: None` (se leen todas; el lector busca la fila de títulos) y columnas por
  su título (Dinak añade columnas de meses). Se ordenan con reglas por la descripción: Pladur → Placas / Perfilería /
  Accesorios / Pastas y yesos (grupos, tipo de pieza y medida: placas por espesor «13 mm» y formato «1200×2500», canal y
  montante «48/30»…); Dinak → doble pared / simple pared / pellets Deko, la medida es el diámetro «Ø150» y el histórico de
  compra sale de las columnas de meses (`hist`, que `_ficha_lineas` usa si no hay líneas de factura). Pladur: la nota
  «Anterior: X € (mes año) → ±Y %» solo vale si el % cuadra con el precio (había notas copiadas de otra fila; `notas_mal`).
  Dinak: margen 25 % sobre la venta = +33,3 % sobre el coste; «PVP de tarifa Dinak 2026» (`pvp_fab`, `fabricante`); el mismo
  código Dinak en dos filas (030120020a/b) se junta en el del precio más reciente; filas sin descripción ni precio, fuera
  (`incompletas`). Fotos: Pladur e Isover del fabricante en `frontend/public/catalogo/pladur/` (`tools/pladur-fotos.py`);
  Placo y Dinak, de referencia de Obramat (`FOTOS_ADEO`, se enlazan); lo que no tiene una parecida, la pegatina. Pegatinas
  `st-pla-*` y `st-dk-*`.
  **Pedidos (16/10/2026)**: hoja «PEDIDOS_CONSTRUDECO» `1mmxp…` (Mi unidad de Andrés, lector casafonsomc; `PEDIDOS_CONSTRUDECO`
  y `"pedidos"` en `TARIFAS`): una fila por línea de pedido de Pladur y Dinak desde 2024 (Fecha dd/mm/aaaa · Documento ·
  Tipo Compra/Presupuesto/Devolución · Tarifa Pladur/Dinak · Código · Descripción · Ud · Cantidad · Precio neto · Importe ·
  ID PDF · Observaciones; códigos y documentos como texto). Sacada de los 100+ PDF de la carpeta de pedidos (OCR; las líneas
  sin código llevan el puesto por la descripción, y se corrigieron códigos mal leídos). `actualizar` la lee junto con la
  tarifa (pestañas `construdeco.PEDIDOS + nombre`); `_con_pedidos` da a cada artículo sus líneas (por código; Dinak primero
  la ref. de Construdeco; si no, por la descripción: mismos números y una palabra en común) → evolución exacta, fecha del
  último pedido, precio anterior y «Abrir pedido (PDF)» (`pdf` → drive.google.com/file/d/…). Si el último pedido trae otro
  precio que la hoja, «Revisar precio» y un apunte; si el código de la hoja no es el de los pedidos, también se apunta.
  Presupuestos (Pladur, R24-003271): «De dónde sale el coste · Presupuesto», no cuentan como compras.
- **Ladrillos (16/10/2026; para todos desde el 19/10/2026)**: hoja «TARIFA_LADRILLOS_2026» `13c9n…` en Mi unidad de Andrés (tiene que
  estar compartida con casafonsomc como lector). Hecha desde la hoja de mostrador **vigente desde el 09/09/2026**
  (`Hoja_Mostrador_Ladrillos_ago2026.pdf`, compra del 08/08/2026; las hojas «Tarifa_Ladrillos_*» e «Importacion_TreyFact_Ladrillos»
  de mayo en Drive son **antiguas**). Pestañas INICIO y TARIFA: una fila por ladrillo; el lector `leer_ladrillos` busca las columnas
  **por su nombre** (Código, Familia, Grupo, Producto, Medidas (cm), Uso, Ud/m², Kg/ud, Ud/palé, Se compra por, Coste (€) por
  centena, Fecha, Pedido, Coste anterior (€), Fecha anterior, PVP/ud, PVP palé, Notas; el resto son fórmulas para Andrés).
  Se vende por unidad; el palé completo va en `escalas` con `cantidad`, `total` y `total_iva` (lo que vale el palé entero; `pvp`
  por pieza). «Precio a confirmar» en Notas = coste de compra antiguo (aviso en la ficha; hueco de 4 y de 6: Andrés aún no
  los ha comprado a precio nuevo, 16/10/2026). Familias en el orden de la hoja
  (`orden_hoja`), pegatinas `st-lad-*` y `st-prov-ladrillos` (`tools/pegatinas-catalogo.py <carpeta> <nombres>` genera solo esas),
  fotos de Cerámica Campo en `frontend/public/catalogo/lad/` (de su web; el rasillón machihembrado, del dibujo de su ficha técnica,
  porque en la web no tiene foto) y de referencia (Obramat, se enlazan) para lo de Alar, que no es de Campo (`FOTOS_LAD`). m², kg y palé con `datosPieza` (lib/tarifas.ts). Margen: palé ≈15 % (al euro), suelto ≥30 % (a 0,05 €).
- `eur()` enseña el tercer decimal por debajo de 1 € si lo tiene (0,242 € con IVA); los importes (cantidad × precio) con `eurC`.
- **Bombonas de gas (16/10/2026; para todos desde el 19/10/2026)**: hoja «TARIFA_GAS_BOMBONAS» `17sRs…` en Mi unidad de Andrés
  (compartida con casafonsomc), pestaña TARIFA: Familia | Grupo | Artículo | PVP con IVA | Sin IVA (fórmula, solo para mirar).
  No es tarifa de compra: solo el PVP con IVA de las hojas plastificadas de la tienda, que Andrés cambia a mano (decisión suya:
  los precios tal cual los tenía). Lector `services/gas.py` (`gas.leer`): «Butano y propano» (Repsol, Cepsa, Casco vacío) y
  «Bombonas camping» (Cargas, Envases, Envase + carga), en el orden de la hoja
  (`orden_hoja` y `orden` de cada fila, como ladrillos). Sin IVA = con IVA ÷ 1,21 con 4 decimales. `solo_pvp` en artículos y ficha: sin botón «Coste», ni
  coste, margen, evolución, compras, proveedor ni leyenda ▲/▼; en la ficha, `MismoGrupo` con el resto del grupo. Pegatinas
  `st-prov-gas`, `st-gas-butano`, `st-gas-camping` (`tools/pegatinas-gas.py`; bombonas genéricas, sin marcas ni logos).
  **Cuadrícula (16/10/2026, Andrés)**: `"vista": "cuadricula"` en `TARIFAS` (sale en `tarifa()`): al entrar en la tarifa salen todas
  de golpe con foto, nombre corto y precio (`components/CuadriculaTarifa.tsx` + `cuadricula.css`), sin pasar por familias. Rejilla
  de 6 columnas: cada grupo ocupa tantas como artículos tiene y el de uno solo (casco vacío) es una tarjeta ancha de dos, así
  las filas quedan completas (Repsol 3 + Cepsa 3 · Casco 2 + Cargas 4 · Envases 2 + Envase+carga 4; Andrés la quería simétrica).
  Estrecho (<1100 px: móvil y tableta en vertical): cada grupo en su fila. Ordenador y móvil: la tarjeta abre la ficha; Con IVA |
  Sin IVA en la cabecera. Tableta (`MostradorPage`, `rejilla`): a todo lo ancho sin el panel de la derecha, más grande; cada toque
  suma uno a lo apuntado (número encima y «−»), barra abajo con lo apuntado, el total y «Ver lista». Fotos en
  `frontend/public/catalogo/gas/` (`tools/gas-fotos.py`: Repsol de su tienda online, Cepsa de su cartel, Campingaz de tiendas de
  camping) y `gas.foto()` elige la de cada fila; las rojas de camping y sus envases (2,8 y 0,5 kg) van dibujadas porque no se sabe la marca.
  Si la tienda saca fotos suyas, sustituir esos .webp con el mismo nombre.
- **Morteros y cementos · Piensos (17/10/2026; para todos desde el 19/10/2026)**: igual que las bombonas, de las hojas plastificadas
  de la tienda (fotos de Andrés) y en cuadrícula. Hojas «TARIFA_MORTEROS_CEMENTOS» `1EJWG…` (la primera, `1BvDP…`, está en la papelera) y «TARIFA_PIENSOS» `1NOFS…` (la anterior, `1aY4m…`, en la papelera) en Mi
  unidad de Andrés (compartidas con casafonsomc), pestaña TARIFA. Costes sacados de Drive el 17/10/2026: morteros de Grupo Puma
  (facturas FNV-…), Tudela Veguín (cemento, CEM V/A 32,5 N de 35 kg: el saco morado) y Construdeco (Prefasec y piedra país, pedidos);
  piensos de **Almacenes Blanco** (Navia; los códigos .00xxxx de la hoja son los suyos; sus facturas llegan en papel y en Drive solo
  hay hasta dic-2025). Los piensos son de **Biona (De Heus)**; algunos ya con otro nombre: Bovitac → Kamperina Plus Tac, Creceba →
  Crecimiento Pollos Oro, Arranque Tradición → Arranque Pollos Oro; Kovital es de terneros (grupo «Vacas y terneros»). Ray grass Nui
  de Rocalba y Xardinagro/Camponovo (Friskies, ray grass, diatomeas). IVA de los piensos según sus facturas: grano, harina
  de cereal y patata al 4 %, lo demás al 10 %. En la hoja de la tienda ponía «Iberplus»: es el Iberplast de Placo. Bovitac pasó a
  saco de 25 kg (10,65 €, 17/10/2026). Los ** de la hoja de la tienda de morteros quieren decir **IVA aparte** (Andrés): Prefasec,
  piedra país y árido llevan «Sí» en la columna «IVA aparte» y su precio es sin IVA (el con IVA = × 1,21 a céntimos). Si un margen
  sale negativo, la ficha lo pone en rojo (`tf-margen-neg`). Lector común de las hojas de la tienda en `services/hoja_tienda.py` (también lo
  usa `gas.py`): columnas por su título, obligatorias Familia | Grupo | Artículo | PVP; opcionales IVA aparte (Sí = el PVP va sin
  IVA), Formato («Saco 25 kg»,
  sale debajo del nombre y da la unidad saco/bolsa), IVA (piensos al 10 % por defecto, patata 4 %; el sin IVA = con IVA ÷ (1 + IVA)),
  Código, Nota, y Coste / Fecha coste / Factura / PDF (si hay coste, la ficha enseña coste, margen y la factura; si no, `solo_pvp`).
  `morteros.foto` / `piensos.foto` eligen la imagen por el nombre (y si no, por el grupo). Morteros: fotos de los sacos en
  `frontend/public/catalogo/mor/` (`tools/morteros-fotos.py`). Piensos: fotos reales del saco en `frontend/public/catalogo/pi/fotos/`
  (`tools/piensos-fotos.py`: Biona/De Heus de su web y de tiendas agrícolas, Friskies, Regenera, Massó, Rocalba; `piensos.FOTOS`); lo
  que no tiene foto de su marca (grano, harinas, pulpa, patata, sal, abono suelto, V. Energía, Kilate gatos, el pienso de perros del
  saco azul) lleva el dibujo en `frontend/public/catalogo/pi/` (`tools/pegatinas-piensos.py`, también el árido a granel y las pegatinas
  `st-prov-morteros` / `st-prov-piensos`). Si la tienda saca fotos de esos sacos, ponerlas en `pi/fotos/` y añadirlas a `FOTOS`.
  **Lista en el ordenador (17/10/2026, Andrés: la cuadrícula de los piensos quedaba enorme)**: `"vista_ordenador": "lista"` en TARIFAS →
  en ≥1100 px, `ListaTarifa` (tarjeta por grupo, una línea por artículo con foto pequeña, nombre, saco y código, y precio; columnas
  que se reparten solas). Botón «Lista | Fotos» al lado del buscador (`tf-vista-pc`, se recuerda en `cfTarifaVistaPc` por tarifa).
  Móvil y tableta, con la cuadrícula.
  Cuadrícula (`CuadriculaTarifa`, `repartir`): grupos de 6 artículos como mucho; si una fila de 6 queda corta, los grupos que quepan
  pasan a tarjetas anchas hasta llenarla (las 3 juntas, solas en su fila, ocupan las 6 columnas), así que el orden de la hoja
  decide cómo casan las filas. El precio va siempre a la misma altura aunque el nombre ocupe dos renglones.
  **«Para qué sirve» (17/10/2026, Andrés)**: en la ficha (lo primero tras el precio; en el ordenador, arriba a la derecha) y en el
  panel de la tableta, para qué se usa cada producto, los datos que suele preguntar el cliente (tipo/norma, rendimiento, espesor,
  fraguado, proteína, etapa…) y un consejo, con enlace a la ficha del fabricante de donde sale. Datos en
  `backend/app/data/fichas_morteros.json` y `fichas_piensos.json` (de la ficha técnica o la web del fabricante; si no la tiene,
  de una tienda que copia su etiqueta; nada inventado: lo genérico —grano, sal, patata— solo lleva el uso; `fuente` es la web y
  `fuente_nombre` lo que se dice si no es la del fabricante; `palabras` casa con el nombre del artículo, gana el primero) y
  `services/fichas_producto.py`; si la hoja de Drive lleva una columna «Para qué sirve», su texto manda. Componente
  `components/ParaQueSirve.tsx`. En la cuadrícula de la tableta, botón «i» en cada tarjeta que tiene ficha (`onInfo`) → cajón a
  la derecha (`PanelInfo`, `?i=prov|ref`, atrás lo cierra). Sin ficha aún: V. Energía, Cerdos crecimiento, Kilate gatos, pienso
  de perros del saco azul y Mezcla 50 % (no se sabe qué lleva); «Nutricun Único» solo con lo que dice el nombre (¿Cunitec Único?).
  Al añadir un producto a la hoja, añadir su ficha al JSON.
- **Precio con IVA por defecto en todas las tarifas (15/10/2026, decisión de Andrés)**: familias (las dos vistas), ficha,
  búsqueda, panel del ordenador, barra del móvil, Manolo y la tableta enseñan primero el precio con IVA; el sin IVA va al lado.
  Botones «Con IVA | Sin IVA | Coste» (`MODOS`, «Con IVA» el primero); lo elegido se recuerda en la pestaña y la ficha y la
  búsqueda lo siguen (`modoGuardado`/`guardarModo` en `lib/tarifas.ts`, clave `cfTarifaModoIva`). `conIva()` usa el PVP+IVA
  de la hoja y, si falta, PVP × 1,21.
- **Tarifas: códigos y vista nueva (13/10/2026)**.
  - Zabaleta, arreglos al leer la hoja (`_comodines_zab` y `_equivalencias_zab` en `tarifas_service.py`, datos en
    `backend/app/data/zabaleta_ajustes.json`; valen para todos): (1) **códigos comodín** (INC, $4016, $5036…: Zabaleta los usa
    para lo que no tiene código y la hoja juntaba en una fila artículos distintos con el precio del último): cada descripción
    de «Detalle facturas» va como artículo propio (`ref` = `INC~<slug de la descripción>`, `comodin`), con su coste, el margen
    de su grupo y el PVP redondeado como la hoja (`_pvp_zab`); si ya está con su código (misma descripción o «REF PM720»), se
    queda solo ese. Su familia y nombre, en `articulos` del JSON. (2) **mismo artículo con dos códigos**: «antes» (Zabaleta le
    cambió el código: se enseña el nuevo con el histórico de los dos; el viejo abre la misma ficha y se busca) y «tambien»
    (PE020 → PAL10020, más caro). Dos referencias con el mismo nombre claro en la misma familia se juntan solas como «antes».
  - Isoltubex: la misma pieza en la lista de netos y sin neto (PEX16-B4 / PEX-A16B4) → se queda la de precio, la otra como
    «también» (`isoltubex.leer`). «Marsella reducido 1/2 M - 3/8 H» ya sale como ⅜″ × ½″.
  - **Vista nueva de la familia (para todos desde el 19/10/2026)**: `TarifaFamiliaPage` = `FamiliaNueva` (la de antes,
    `FamiliaActual`, con botones de medida, se quitó). Medidas arriba (`mp`/`op`/`ms` de cada pieza, de `medida_principal` y
    `medidas_de`: «todo lo de 20», una reducción 3/4"×1/2" sale también en 1/2"; solo si hay ≥4 y alguna junta grupos
    distintos; `?medida=` en la dirección). Grupos con varias piezas de la misma medida (tubos con `metros`, `repes`, etiquetas
    repetidas) van en filas con código, precio y €/m; los demás, en botones. Código a la vista en filas, panel, barra del móvil,
    tabla de búsqueda y ficha (código antiguo, «también sale como», aviso de comodín, €/m). Clases `tfn-*` en `tarifas.css`.
  - **Familia en lista (16/10/2026, opción B elegida por Andrés entre tres)**: en la vista nueva ya no hay botones de medida.
    Cada subcategoría es una lista y todo va en líneas (nombre, código, precio), igual tenga medidas o no: lo que tiene varias
    medidas es una línea con «desde X €» y flecha que se abre en una línea por medida (código y precio). Con `mezclar` (lo pone
    el servidor en las tarifas que van por nombre, no en el orden de la hoja ni en Hierros) se mezclan por orden alfabético lo
    de medidas y lo suelto (`piezasDe`). Un grupo de una sola medida sale como suelto. En el móvil empiezan cerradas; en el
    ordenador, abiertas si la familia tiene ≤40 artículos. «Abrir/Cerrar todas las medidas» (`todas`) y las que se tocan a mano
    (`a`) van en la dirección: al volver de la ficha sigue igual. Cerrada, la línea dice las medidas («3/4" · 1 1/4"» o «8 medidas
    · de X a Y») y ▲/▼ si alguna cambió. Hierros: la línea de la medida dice «50×50×3» en vez de «3». Clases `tfl-*`.
    **19/10/2026, Andrés: «todas las tarifas como están para mí, de la misma forma para el resto»**: todas las tarifas sin
    `en_pruebas`, solo `FamiliaNueva` y sin los `esEncargado()` de Resultados, panel y ficha (código a la vista para todos).
    La tienda y Manolo ya veían el coste y el margen; eso no cambia.
  - Pruebas: `backend/tests/test_tarifas.py` (datos inventados: el repo es público, no van precios reales).
- Horas: `created_at` y similares en UTC; campos de firmas y turnos en hora de Madrid (ver informe
  en el historial de git, commit «Revisión completa»).

## Mostrador: tarifas en la tableta (14/10/2026; encargado y tienda desde el 19/10/2026)
- Tableta junto al ordenador de ventas: buscar con el dedo y ver el precio en grande para pasarlo a TreyFACT.
  `/mostrador` (`pages/MostradorPage.tsx` + `mostrador.css`), a pantalla completa y sin el menú (`AppShell` en `App.tsx`;
  admin y tienda; Manolo no la tiene). En el menú: Mostrador → «Tarifas en la tableta».
- Lee todas las tarifas al entrar (búsqueda al instante; lo más parecido arriba: código exacto, luego lo que empieza igual).
  Si una no se puede leer (hoja sin compartir, Drive caído), las demás siguen: aviso en la portada «No se pudo leer la tarifa
  de…» con «Reintentar», y al entrar en esa sale su error (`fallidas`, `Promise.allSettled`). Antes se quedaba toda la tableta en error.
  Reutiliza lo exportado de `TarifasPage.tsx` (`buscar`, `seccionesDe`, `medidasDe`, `Foto`, `cache`…), vista nueva de familias.
- Horizontal (≥900 px): navegación a la izquierda y panel fijo a la derecha (precio con IVA enorme y el sin IVA debajo para
  TreyFACT, €/m, código; hasta el 15/10/2026 el enorme era el sin IVA);
  vertical: el panel sube desde abajo. Todo tocable ≥56 px. Estado en la dirección (`p`, `f`, `m`, `q`, `r`) para que «atrás» funcione.
- Coste y margen tapados por defecto (el cliente ve la tableta): botón del ojo (`cfMostradorCoste`, sessionStorage).
- «Apuntado»: lista del cliente de delante con cantidades, casilla para tachar lo ya pasado a TreyFACT y total (con IVA, y debajo sin IVA); se queda en la
  tableta (`cfMostradorLista`), «Borrar lista» con deshacer. «Lo último que miraste» en la portada (`cfMostradorRecientes`).
- **Cantidad tocando la foto (16/10/2026, Andrés)**: cada toque en la foto del artículo suma 1 a lo apuntado (dos toques, dos), con el
  número grande encima y «Quitar uno»; sin aviso por toque. El palé completo (ladrillos) se apunta igual en su botón (línea `ref#pale`,
  precio del palé). Para muchas piezas o decimales, «Escribir otra cantidad» abre el campo de antes. La foto sale también en vertical.
- Pantalla siempre encendida (Wake Lock) y botón de pantalla completa donde el navegador lo permite.

## Órdenes de carga desde el albarán de TreyFACT (desde el 13/10/2026, para todos: admin y tienda)
- Forma de trabajo: el albarán se hace en TreyFACT (valorado o no) → se sube en «Albaranes de venta» → o se firma en la
  tienda, o «Al camión» (`components/AlCamion.tsx`: `AlCamionModal` elige viaje nuevo o uno en preparación;
  `ElegirAlbaranes` desde «Nueva carga» y «Añadir albaranes» en la orden). Ya **no** hay foto de la libreta en la
  interfaz (decisión de Andrés); el endpoint `/api/cargas/leer` sigue para las órdenes antiguas.
- `POST /api/cargas/desde-albaranes` {ids, orden_id?}: lee los materiales del PDF con `services/albaran_lineas.py`
  (texto del PDF → IA; solo código, cantidad, unidad y descripción; nunca precios) y crea una entrega por albarán
  (`EntregaCarga.albaran_id`, `LineaCarga.codigo`). Un albarán solo puede ir en una orden.
- Al firmar la entrega, la misma firma pasa al albarán (`firmas.firmar_desde_entrega`): queda «firmado» y archivado por
  cliente. «Repetir la firma» lo devuelve a pendiente (no si está facturado). La hoja lleva «Albarán S-…» y los códigos.
- Si se sube otra versión de un albarán que va en una carga, la entrega avisa y sale «Volver a leer el albarán»
  (`POST /api/cargas/entregas/{eid}/releer`). No se puede borrar un albarán que va en una carga sin firmar.
- «Por pasar a TreyFACT» solo queda para las entregas antiguas de la libreta (sin `albaran_id`).
- `GET /api/firmas` devuelve `carga_id` / `carga_estado` de cada albarán (`con_carga`).
- Desde el 13/10/2026 lo usa toda la tienda (backend `_acceso` en `api/cargas.py`: admin y tienda; reparto con su lista).
  El «Al camión» antiguo (`reparto_at` en albaranes) ya no se ofrece; lo que ya estuviera en el camión sigue en el móvil de Melchor.
- Enviar a Melchor es opcional: si la lleva otro, se carga y se firma desde la propia orden.

## Órdenes de carga → Melchor
- Andrés prepara la orden en `/cargas/:id` y pulsa «Enviar a Melchor» (`POST /api/cargas/{id}/enviar`, campo
  `enviada_at`; «Retirar» la quita). Le llega un aviso push y le sale en su Inicio («Para cargar»,
  `components/CargasReparto.tsx`, `GET /api/cargas/para-cargar`), y abre `/reparto/cargas/:id` (misma página con `reparto`).
- Melchor solo puede: ver las enviadas, marcar cargado, firmar, poner la foto y ver la hoja (lista `_REPARTO` en
  `app/api/cargas.py`). Al firmar le llega un aviso a Andrés.
- Lo ya entregado y firmado desaparece de su Inicio (antes se quedaba 18 h como «carga entregada» y parecía pendiente;
  `para-cargar` lo sigue devolviendo y el Inicio dice «Todo entregado»). Si Melchor firma un albarán desde «Firmar otro
  albarán de la tienda» y ese albarán va en una de sus órdenes, la entrega queda cerrada con esa firma
  (`cargas.cerrar_por_albaran`, desde `firmas._firmar` con rol reparto). Lo firmado en la tienda **no** cierra la entrega
  (se puede firmar en el mostrador y llevarlo después): si no se va a llevar, quitar la entrega de la orden.
- «Listo para llevar» (`PUT /api/cargas/entregas/{eid}/lista`, campo `lista_at`): al acabar de cargar se confirma y la lista
  queda bloqueada (el servidor rechaza cambios de líneas con 409); solo entonces sale «Firma del cliente». «Desbloquear
  para cambiar» lo deshace. Vale sin cobertura (tipo `lista` en `lib/offlineCargas.ts`). Igual para todos los roles.

## Vencimientos de facturas (Andrés; Manolo solo los ve)
- El script de facturas (Apps Script de la cuenta de Andrés, «FacturasAutomaticas») lleva un archivo extra
  `tools/vencimientos-facturas.gs`: cada hora lee las facturas nuevas de «FACTURAS PARA GESTORIA», apunta los
  plazos en la pestaña «Vencimientos» de «Log Facturas» y los manda a `POST /api/vencimientos/importar`
  (cabecera `X-Clave` = `VENCIMIENTOS_CLAVE` de Railway; ruta libre de sesión en `main.py`).
- `GET /api/vencimientos` solo admin. Inicio (`VencimientosCard`): hoy, mañana y pasado (los viernes hasta el lunes) y las
  grandes que se acercan; al tocarla lleva a `/vencimientos` (`VencimientosPage`, «En pruebas», `GET /api/vencimientos/detalle`):
  resumen, semanas, día a día (próximos / ya cargados), meses, aviso de grandes, por proveedor, últimas recibidas y sin fecha.
  Piezas comunes en `components/VencComun.tsx`. Aviso rojo si el script lleva >50 h sin mandar (`atrasado`), lecturas raras
  («Para revisar», `revisar()`: vence antes de la factura, a más de 6 meses, sin importe, plazos que no suman) y tocar una
  semana filtra «Día a día».
  Sin botón de pagado: se pagan solas por el banco. Aviso push a Andrés a las 9 si algo vence.
  También: barras de lo que se carga cada semana (5 semanas), aviso anticipado de facturas grandes (umbral y días en
  `venc_ajustes`, se cambian desde el engranaje de la tarjeta; push una sola vez por factura, `venc_avisos`) y
  pendiente por proveedor con su forma de pago y a cuántos días suele vencer.

## Repaso general (15/10/2026, publicado ese día)
Informe completo en el proyecto de claude.ai (`claude/repaso-app-2026-10-15.md`). Andrés pidió dejar como estaban el botón
único de «Subir albaranes» (compra/venta separados) y qué precio manda entre tarifas y «Consultar precio» (casi no se usa).
- **Precios**: el PVP sin IVA se saca ahora del PVP con IVA ya redondeado (`margin_service.calculate_pricing`), así la etiqueta
  y TreyFACT dan lo mismo (antes podía salir 4,25 € en la etiqueta y 4,30 € en TreyFACT). Redondeo «hacia arriba» sin el fallo
  de coma flotante (0,15 → 0,20). Arreglo puntual `precio_v2` en `database.py` para los artículos ya guardados.
- **Códigos ART**: los inventados por la IA (ART-0001…) chocaban entre albaranes; ahora `ART-<albarán>-<n>` (`codigo_unico`)
  y arreglo puntual `codigo_v2`.
- **Albaranes de compra**: el mismo archivo subido dos veces devuelve el que había (`huella` sha256, `repetido` en la
  respuesta; la app avisa «ya estaba subido»). Errores de la IA en español (`LecturaError`, `mensaje_para_persona`),
  4 reintentos, salida de 16 000 tokens y texto del PDF hasta 60 000 caracteres. Drive: `drive_proveedor.repasar` reintenta
  cada 30 min los leídos sin copia.
- **Firma de entrega y albarán cambiado**: si se sube otra versión de un albarán que va en una carga sin entregar, la entrega
  queda `albaran_cambiado`; al firmar, la firma no pasa sola al albarán nuevo y en el albarán sale «Pasarle la firma de la
  entrega» (`POST /api/firmas/{id}/firma-de-entrega`). **Anular la firma** (`POST /api/firmas/{id}/anular-firma`): no si está
  facturado ni si va en una carga ya entregada; está en «Más opciones» del albarán.
- **Quién firma**: botones con los nombres que ya firmaron para ese cliente (`firmantes`) en el albarán y en la firma del camión.
  En la firma del camión el nombre del cliente sale ya puesto (Andrés lo quiere así: Melchor no escribe nada; el mismo
  15/10/2026 se probó vacío y se volvió atrás); los botones sirven para poner a una persona. Materiales plegados y botones
  siempre a la vista; los avisos («Falta el nombre…») salen en la barra fija de «Firmar».
- **Sin cobertura**: la cola de cargas ya no pierde nada (401/403/5xx esperan; 404/409 avisan con «Reintentar» o «Quitar y
  volver a firmar»); el service worker baja todos los trozos de la app nueva antes de borrar los viejos (pantalla en blanco
  sin cobertura tras publicar). Pantalla de error propia (`components/ErrorPantalla.tsx`) en vez de la página en blanco.
- **Volver y filtros**: botón «Volver» en la cabecera del móvil en todas las pantallas que no son de la barra de abajo
  (`MobileHeader`, `padreDe`). Albaranes de venta guardan vista, cliente, obra, mes y búsqueda en la dirección: al volver de un
  albarán sigue todo igual, y también la posición de la lista (`ScrollRestoration` por entrada del historial). En el móvil los
  filtros se pliegan tras «Filtrar». La búsqueda no distingue tildes ni ñ y busca cada palabra por separado.
- **Números**: `numES`/`euros` en `lib/texto.ts` (siempre con punto de miles) en toda la app. Tableta: 1,5 ya no se convierte en 15.
  Tarifas: la unidad sale en el título del grupo y ▲/▼ en la evolución; «20» busca la medida entera.
- **Pequeños**: título de la pestaña con lo que hay por firmar, días de vencimientos plegados en el móvil (salvo hoy), «Llamar»
  en cada entrega, aviso al cerrar un pedido o reparación a medio escribir, Intro pasa a la siguiente línea del pedido,
  botones de estado sin doble toque, códigos nuevos de 6 caracteres como mínimo (los de antes siguen valiendo), vencimientos que no rechazan el lote entero por
  un importe raro, aviso de las 9 una vez al día, sin modo oscuro a medias (`color-scheme: light`), textos sin jerga
  («Leído», «Leyendo…», «No se leyó», errores sin números de servidor). Manolo: si los vencimientos no se actualizan, «Avisa a Andrés».
- **Versión nueva**: `NuevaVersion` recarga sola si está en Inicio (`/`, `/reparto`, `/mostrador`), sin tocar nada 2 min,
  sin ventanas abiertas, sin escribir, sin pantalla completa y sin nada en las colas; si no, sale la barra como antes.
- Rutas desconocidas llevan a Inicio.

## Publicar
- Railway despliega desde la rama **`claude/invoice-ocr-processing-app-1LgBH`**.
  Publicar = `git push origin HEAD:claude/invoice-ocr-processing-app-1LgBH`.
  Subir a otra rama NO publica nada.
- Antes de publicar: `npx tsc --noEmit -p frontend` y `npm run build` sin errores, y prueba en local.
- Cambios grandes o dudosos: enseñar antes a Andrés (vídeo o capturas) y publicar con su ok.

## Probar en local
- Backend: `DATABASE_URL=sqlite:///ruta/app.db uvicorn app.main:app --port 8000` (desde `backend/`).
  Sin clave de IA en local: simular `carga_service.leer` / extracción si hace falta.
- Frontend: `npm run build && npx vite preview --port 3000` (proxy a :8000), o `npx vite` para desarrollo.
- Sesión: poner en localStorage `cfToken`, `cfRol` (`admin`/`tienda`/`reparto`) y `cfAvisosNo='1'`.
- Probar con Playwright en 390 px, 320 px, 1280×800, 1366×650 (portátil) y 1920×1080; mirar las capturas, no solo que no haya errores.

## Pendiente (octubre 2026)
- Ordenar a mano el camión de Melchor (`reparto_orden` existe, falta endpoint y botones).
- Análisis: ordenar por importe gastado (falta `SUM` en `top-products`).
- Festivo nacional de agosto 2027 marcado «por confirmar» en `turnos_service.py` (revisar con el BOE).
- Probar la lectura de materiales con albaranes reales de TreyFACT (en local solo con PDFs de imitación).
- Siguiente paso pensado: carpeta vigilada en el PC de la tienda que sube sola los PDF que se guardan desde TreyFACT;
  más adelante, leer (solo leer) la base de datos de TreyFACT.
- Ideas aparcadas: márgenes de impresión de etiquetas, sección Clientes.
