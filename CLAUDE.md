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
  para avisar de cosas nuevas, cambiar `VERSION` y la lista `COSAS`. Última: `2026-10-15` (tarifas con IVA, «Volver», firmantes
  y anular firma, buscar sin tildes).
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
  (`LECTORES`: Hierros Santander y Zabaleta; Zabaleta trae cada línea de factura en «Detalle facturas», así que la evolución y la factura exacta salen de ahí, y en la app se enseña con una organización propia: 14 familias, grupos, tipo de pieza con sus medidas y un nombre claro por referencia, en `backend/app/data/zabaleta_catalogo.json`, generado con `tools/zabaleta-clasifica.py`; las referencias nuevas salen en «Nuevos (sin ordenar)» de su familia hasta que se añaden al clasificador; sus PDF están en la carpeta NAVARRO ZABALETA del Drive de casafonsomc, `Zabaleta_AAAA-MM-DD_nº.pdf`); Isoltubex (oct. 2026, **en pruebas: solo admin** — `en_pruebas` en `TARIFAS`, `_prov`/`resumen` en `api/tarifas.py` devuelven 404 / la ocultan al resto; quitar la marca cuando Andrés la apruebe): hoja «TARIFA_ISOLTUBEX_2026» `1JGwp…` (hay dos copias viejas de abril con el mismo nombre: no usarlas), una pestaña por tipo de accesorio + SIN_NETO_AVISO; sin facturas (el coste es el de sus listas de netos, mes en las notas de INICIO). Se ordena con reglas en `services/isoltubex.py` (9 familias, grupos, tipo de pieza, medida «16 × ½″» y nombre claro; las referencias nuevas caen solas). Fotos del catálogo oficial (isoltubex.net, catalogoIsoltubex2025.pdf) en `frontend/public/catalogo/iso/`, por referencia y por tipo en `backend/app/data/isoltubex_fotos.json`, generadas con `tools/isoltubex-fotos.py` (correcciones a mano en FORZAR / XREF_GRUPO / XREF_REF); pegatinas `st-iso-*`). Pegatinas en `frontend/public/catalogo/` (generadas con
  `tools/pegatinas-catalogo.py`); las fotos de referencia se enlazan desde Obramat/Leroy Merlin (`lib/tarifas.ts`),
  no se copian al repo. En el ordenador (≥1100 px) las medidas van en filas con un panel fijo a la derecha
  (precio, coste y factura sin salir de la lista); en móvil, barra flotante «Ver ficha». La búsqueda sale en tabla en el
  ordenador; «/» lleva al buscador e Intro abre el primero. La factura abre su PDF (acción `archivos` del Apps Script sobre la carpeta ALBARANES/<proveedor>); si no lo encuentra, busca el nº en Drive.
- **Mallas J. Silva Moreira (14/10/2026, en pruebas: solo admin)**: hoja «TARIFA_SILVA_MOREIRA_2026» `1ROnV…` en Mi unidad
  de Andrés (compartida con casafonsomc). Pestañas INICIO (nº de pedido) y TARIFA: una fila por rollo (código, familia, gama,
  alto/alambres/separación, metros, rollos/palé, coste del pedido 520.42043 de may-26, margen, PVP, PVP+IVA, €/m, precio desde
  5 rollos y de palé, con y sin IVA). Márgenes sobre coste fila a fila en las celdas amarillas (L tarifa, T desde 5 rollos, U palé): ligera 100 m 40/30/20 %,
  ligera 50 m 45/30/20 %, fuerte y nudo fijo 35/25/15 % (decisión de Andrés, 14/10/2026). PVP a 0,10 €. `desde` en TARIFAS
  obliga a releer copias anteriores a esa hora (la primera hoja `1oIoL…` está en la papelera).
  Lector `leer_silva` en `tarifas_service.py`: familia → gama → «Rollo de N m» con las medidas en botones. Precios por cantidad
  en `escalas` (nombre, pvp, pvp_iva, margen; columnas P–S y T–U de la hoja): filas en el panel del ordenador, línea en la barra
  del móvil y caja «Precio por cantidad» en la ficha (`tf-escalas`). La fecha del pedido sale de INICIO («del dd/mm/aaaa»). Fotos oficiales de jsilvamoreira.pt (Ovimor L → ligera, Ovimor M → fuerte, Nodimor →
  nudo fijo) en `frontend/public/catalogo/silva/`, por familia (`foto` del lector y `fotoArticulo` en `lib/tarifas.ts`). También
  sustituyen a la pegatina de la familia (tarjetas, cabecera, buscador): `claveFamilia` devuelve `silva-*` y `pegatina()` da la foto;
  estilo con borde blanco en `tarifas.css` (`img[src^="/catalogo/silva/"]`).
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
  - **Vista nueva de la familia, en pruebas (solo admin)**: `TarifaFamiliaPage` elige `FamiliaNueva` (encargado) o
    `FamiliaActual` (tienda y Manolo, la de siempre). Medidas arriba (`mp`/`op`/`ms` de cada pieza, de `medida_principal` y
    `medidas_de`: «todo lo de 20», una reducción 3/4"×1/2" sale también en 1/2"; solo si hay ≥4 y alguna junta grupos
    distintos; `?medida=` en la dirección). Grupos con varias piezas de la misma medida (tubos con `metros`, `repes`, etiquetas
    repetidas) van en filas con código, precio y €/m; los demás, en botones. Código a la vista en filas, panel, barra del móvil,
    tabla de búsqueda y ficha (código antiguo, «también sale como», aviso de comodín, €/m). Clases `tfn-*` en `tarifas.css`.
    Cuando Andrés la apruebe: dejar solo `FamiliaNueva` y quitar los `esEncargado()` de Resultados, panel y ficha.
  - Pruebas: `backend/tests/test_tarifas.py` (datos inventados: el repo es público, no van precios reales).
- Horas: `created_at` y similares en UTC; campos de firmas y turnos en hora de Madrid (ver informe
  en el historial de git, commit «Revisión completa»).

## Mostrador: tarifas en la tableta (14/10/2026, en pruebas: solo admin)
- Tableta junto al ordenador de ventas: buscar con el dedo y ver el precio en grande para pasarlo a TreyFACT.
  `/mostrador` (`pages/MostradorPage.tsx` + `mostrador.css`), a pantalla completa y sin el menú (`AppShell` en `App.tsx`;
  a la tienda le manda a `/tarifas`). En el menú: En pruebas → «Tarifas en la tableta».
- Lee todas las tarifas al entrar (búsqueda al instante; lo más parecido arriba: código exacto, luego lo que empieza igual).
  Reutiliza lo exportado de `TarifasPage.tsx` (`buscar`, `seccionesDe`, `medidasDe`, `Foto`, `cache`…), vista nueva de familias.
- Horizontal (≥900 px): navegación a la izquierda y panel fijo a la derecha (precio con IVA enorme y el sin IVA debajo para
  TreyFACT, €/m, código; hasta el 15/10/2026 el enorme era el sin IVA);
  vertical: el panel sube desde abajo. Todo tocable ≥56 px. Estado en la dirección (`p`, `f`, `m`, `q`, `r`) para que «atrás» funcione.
- Coste y margen tapados por defecto (el cliente ve la tableta): botón del ojo (`cfMostradorCoste`, sessionStorage).
- «Apuntado»: lista del cliente de delante con cantidades, casilla para tachar lo ya pasado a TreyFACT y total (con IVA, y debajo sin IVA); se queda en la
  tableta (`cfMostradorLista`), «Borrar lista» con deshacer. «Lo último que miraste» en la portada (`cfMostradorRecientes`).
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
