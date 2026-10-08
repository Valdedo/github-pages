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
  `theme.css` (tema), `estilos-b.css` y `estilos-c.css` (ajustes posteriores). Utilidades en
  `src/lib/` (`texto.ts` búsqueda sin tildes/fechas/plurales, `descargas.ts`, `estados.ts`).
- Horas: `created_at` y similares en UTC; campos de firmas y turnos en hora de Madrid (ver informe
  en el historial de git, commit «Revisión completa»).

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
- Probar con Playwright en 390 px, 320 px y 1280 px; mirar las capturas, no solo que no haya errores.

## Pendiente (octubre 2026)
- Anular la firma de un albarán de venta (no existe endpoint).
- Ordenar a mano el camión de Melchor (`reparto_orden` existe, falta endpoint y botones).
- Análisis: ordenar por importe gastado (falta `SUM` en `top-products`).
- Festivo nacional de agosto 2027 marcado «por confirmar» en `turnos_service.py` (revisar con el BOE).
- Repaso específico del **escritorio** con el mismo cuidado que el móvil.
- Ideas aparcadas: márgenes de impresión de etiquetas, sección Clientes, importar albaranes de venta
  en TreyFACT, pasar Órdenes de carga a Melchor cuando Andrés lo apruebe.
