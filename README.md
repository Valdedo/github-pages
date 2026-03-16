# 📦 Procesador de Albaranes

Aplicación web para procesar albaranes de ferretería y materiales de construcción mediante IA (OCR + Claude API). Extrae artículos automáticamente, calcula precios de venta y genera Excel y etiquetas PDF con códigos de barras y QR.

---

## ✨ Funcionalidades

| Función | Descripción |
|---------|-------------|
| 📄 **Subida de albaranes** | PDF digital o foto (JPG/PNG), hasta 20 MB |
| 🤖 **Extracción con IA** | Claude API detecta artículos, precios, descuentos y códigos |
| 📊 **Tabla editable** | Edita cualquier campo directamente en pantalla |
| 💰 **Cálculo de PVP** | Margen variable por tramos de coste, configurable |
| 📊 **Exportar Excel** | Hoja con todos los artículos y columnas de datos |
| 🏷️ **Etiquetas PDF** | Etiquetas 10×5 cm con precio, código de barras y QR |
| 🔍 **Info técnica** | Búsqueda automática de especificaciones en internet |

---

## 🚀 Instalación rápida (Docker)

### Requisitos
- Docker y Docker Compose instalados
- Clave API de Anthropic (Claude) — [Obtener aquí](https://console.anthropic.com/)

### Pasos

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd albaran-processor

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env y pon tu ANTHROPIC_API_KEY

# 3. Crear directorio de datos
mkdir -p data/uploads data/exports

# 4. Construir y arrancar
docker compose up --build

# La aplicación estará disponible en:
# Frontend: http://localhost:3000
# API:      http://localhost:8000
# Docs API: http://localhost:8000/docs
```

---

## 🛠️ Instalación para desarrollo

### Backend (Python)

```bash
cd backend

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Instalar dependencias
pip install -r requirements.txt

# Instalar Tesseract OCR (para imágenes escaneadas)
# Ubuntu/Debian:
sudo apt-get install tesseract-ocr tesseract-ocr-spa

# Configurar variables
cp ../.env.example .env
# Editar .env con tu ANTHROPIC_API_KEY

# Arrancar el servidor
DATABASE_URL=sqlite:///./data.db UPLOAD_DIR=./uploads EXPORT_DIR=./exports uvicorn app.main:app --reload --port 8000
```

### Frontend (Node.js)

```bash
cd frontend
npm install
npm run dev
# → Disponible en http://localhost:3000
```

---

## 📁 Estructura del proyecto

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Configuración
│   │   ├── database.py          # SQLAlchemy + SQLite
│   │   ├── models/              # Modelos de base de datos
│   │   ├── schemas/             # Esquemas Pydantic
│   │   ├── api/                 # Endpoints API REST
│   │   └── services/            # Lógica de negocio
│   ├── tests/                   # Tests (pytest)
│   ├── sample_docs/             # Albaranes de ejemplo
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Router principal
│   │   ├── api/client.ts        # Cliente API (axios)
│   │   ├── pages/               # Páginas de la app
│   │   └── components/          # Componentes UI
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🗺️ Cómo usar la aplicación

### 1. Subir un albarán
- Ve a la página de inicio (`http://localhost:3000`)
- Arrastra un PDF o foto al área de subida, o haz clic para seleccionar
- La IA procesará el documento automáticamente (5–15 segundos)

### 2. Revisar y editar artículos
- La tabla mostrará todos los artículos detectados
- **Haz clic en cualquier celda** para editarla
- Los precios (PVP) se recalculan automáticamente al cambiar cualquier dato
- 🟢 Verde = margen automático por tramos
- 🔵 Azul = margen manual (haz clic en ↺ para restablecer)

### 3. Configurar márgenes
- Haz clic en **"Configuración de márgenes y precios"** para desplegar el panel
- Edita los tramos de margen según tus necesidades
- Elige entre redondeo estándar (ej: 20,57 €) o psicológico (ej: 20,99 €)
- Haz clic en **"Guardar y recalcular"** para aplicar a todos los artículos

### 4. Exportar

| Botón | Función |
|-------|---------|
| 🔄 **Reprocesar extracción** | Vuelve a analizar el documento con IA |
| 📊 **Exportar Excel** | Descarga .xlsx con todos los artículos |
| 🏷️ **Generar etiquetas PDF** | Descarga PDF con etiquetas 10×5 cm |

---

## ⚙️ Configuración (.env)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | **Obligatorio** — clave Claude | — |
| `CLAUDE_MODEL` | Modelo Claude | `claude-3-5-haiku-latest` |
| `DATABASE_URL` | Base de datos | `sqlite:////data/app.db` |
| `BASE_URL` | URL app para QR codes | `http://localhost:3000` |
| `MAX_UPLOAD_SIZE_MB` | Tamaño máximo upload | `20` |

---

## 🧪 Tests

```bash
cd backend
pip install pytest pytest-asyncio
pytest tests/ -v
```

---

## 📄 Generar albaranes de prueba

```bash
cd backend
python -m sample_docs.generate_all
# Genera 3 PDFs de ejemplo en backend/sample_docs/
```

---

## 🔌 API

Documentación interactiva: `http://localhost:8000/docs`

Endpoints principales:
- `POST /api/documents/upload` — subir albarán
- `GET /api/documents/{id}` — ver artículos
- `PUT /api/articles/{id}` — editar artículo
- `GET /api/export/excel/{id}` — descargar Excel
- `GET /api/export/labels/{id}` — descargar etiquetas PDF
- `GET /api/settings` — configuración de márgenes

---

## 🏗️ Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + TanStack Table |
| Backend | Python 3.11 + FastAPI + SQLAlchemy |
| IA | Anthropic Claude API (claude-3-5-haiku) |
| OCR | pdfplumber + pytesseract + OpenCV |
| Excel | openpyxl |
| PDF etiquetas | reportlab |
| Códigos de barras | python-barcode + qrcode |
| Base de datos | SQLite |
