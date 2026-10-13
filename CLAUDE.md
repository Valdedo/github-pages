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
  las fechas de Andrés. Salen la primera apertura del día (`cfFiestaDia`); tienen prioridad sobre las sorpresas.
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
  para avisar de cosas nuevas, cambiar `VERSION` y la lista `COSAS`.
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
- Horas: `created_at` y similares en UTC; campos de firmas y turnos en hora de Madrid (ver informe
  en el historial de git, commit «Revisión completa»).

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
- Anular la firma de un albarán de venta (no existe endpoint).
- Ordenar a mano el camión de Melchor (`reparto_orden` existe, falta endpoint y botones).
- Análisis: ordenar por importe gastado (falta `SUM` en `top-products`).
- Festivo nacional de agosto 2027 marcado «por confirmar» en `turnos_service.py` (revisar con el BOE).
- Probar la lectura de materiales con albaranes reales de TreyFACT (en local solo con PDFs de imitación).
- Siguiente paso pensado: carpeta vigilada en el PC de la tienda que sube sola los PDF que se guardan desde TreyFACT;
  más adelante, leer (solo leer) la base de datos de TreyFACT.
- Ideas aparcadas: márgenes de impresión de etiquetas, sección Clientes.
