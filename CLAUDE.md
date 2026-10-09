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
- **Tarifas** (en pruebas, solo admin): `/tarifas` → proveedor → familia → medidas → ficha. Las tarifas siguen en
  Google Sheets (las actualizan las tareas programadas de Claude); la app las lee con la acción `hoja` del Apps Script
  (`tools/correo-casafonso.gs`, la hoja tiene que estar compartida con casafonsomc), guarda copia en `tarifa_copias`
  y apunta cada precio visto en `tarifa_precios` (evolución). Lector por proveedor en `services/tarifas_service.py`
  (`LECTORES`: Hierros Santander y Zabaleta; Zabaleta trae cada línea de factura en «Detalle facturas», así que la evolución y la factura exacta salen de ahí, y en la app se enseña con una organización propia: 14 familias, grupos, tipo de pieza con sus medidas y un nombre claro por referencia, en `backend/app/data/zabaleta_catalogo.json`, generado con `tools/zabaleta-clasifica.py`; las referencias nuevas salen en «Nuevos (sin ordenar)» de su familia hasta que se añaden al clasificador; sus PDF están en la carpeta NAVARRO ZABALETA del Drive de casafonsomc, `Zabaleta_AAAA-MM-DD_nº.pdf`). Pegatinas en `frontend/public/catalogo/` (generadas con
  `tools/pegatinas-catalogo.py`); las fotos de referencia se enlazan desde Obramat/Leroy Merlin (`lib/tarifas.ts`),
  no se copian al repo. En el ordenador (≥1100 px) las medidas van en filas con un panel fijo a la derecha
  (precio, coste y factura sin salir de la lista); en móvil, barra flotante «Ver ficha». La búsqueda sale en tabla en el
  ordenador; «/» lleva al buscador e Intro abre el primero. La factura abre su PDF (acción `archivos` del Apps Script sobre la carpeta ALBARANES/<proveedor>); si no lo encuentra, busca el nº en Drive.
- Horas: `created_at` y similares en UTC; campos de firmas y turnos en hora de Madrid (ver informe
  en el historial de git, commit «Revisión completa»).

## Órdenes de carga → Melchor
- Andrés prepara la orden en `/cargas/:id` y pulsa «Enviar a Melchor» (`POST /api/cargas/{id}/enviar`, campo
  `enviada_at`; «Retirar» la quita). Le llega un aviso push y le sale en su Inicio («Para cargar»,
  `components/CargasReparto.tsx`, `GET /api/cargas/para-cargar`), y abre `/reparto/cargas/:id` (misma página con `reparto`).
- Melchor solo puede: ver las enviadas, marcar cargado, firmar, poner la foto y ver la hoja (lista `_REPARTO` en
  `app/api/cargas.py`). Al firmar le llega un aviso a Andrés.
- «Listo para llevar» (`PUT /api/cargas/entregas/{eid}/lista`, campo `lista_at`): al acabar de cargar se confirma y la lista
  queda bloqueada (el servidor rechaza cambios de líneas con 409); solo entonces sale «Firma del cliente». «Desbloquear
  para cambiar» lo deshace. Vale sin cobertura (tipo `lista` en `lib/offlineCargas.ts`). Igual para todos los roles.

## Vencimientos de facturas (solo Andrés)
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
- Ideas aparcadas: márgenes de impresión de etiquetas, sección Clientes, importar albaranes de venta
  en TreyFACT.
