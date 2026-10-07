from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str = Field(default="", env="ANTHROPIC_API_KEY")
    claude_model: str = Field(default="claude-sonnet-4-6", env="CLAUDE_MODEL")

    # Database
    database_url: str = Field(default="sqlite:////data/app.db", env="DATABASE_URL")

    # Storage
    upload_dir: str = Field(default="/data/uploads", env="UPLOAD_DIR")
    export_dir: str = Field(default="/data/exports", env="EXPORT_DIR")
    max_upload_size_mb: int = Field(default=20, env="MAX_UPLOAD_SIZE_MB")

    # App
    base_url: str = Field(default="http://localhost:3000", env="BASE_URL")
    allowed_extensions: str = Field(default="pdf,jpg,jpeg,png", env="ALLOWED_EXTENSIONS")

    # Envío de correos desde casafonsomc@gmail.com a través de un Apps Script
    # (Railway Hobby bloquea SMTP, así que se envía por HTTPS)
    mail_relay_url: str = Field(default="", env="MAIL_RELAY_URL")
    mail_relay_key: str = Field(default="", env="MAIL_RELAY_KEY")
    # Códigos de acceso por persona: "andres:123456,patricia:...,oscar:...,melchor:...,tienda:..."
    codigos: str = Field(default="", env="CODIGOS")
    # Carpeta «ALBARANES» de Drive (casafonsomc@gmail.com) con una subcarpeta por proveedor
    drive_albaranes_id: str = Field(default="1-1jmSwZz4ctHkMtP_4KWApb6X6Ey1_Jz", env="DRIVE_ALBARANES_ID")

    # OCR
    tesseract_lang: str = Field(default="spa+eng", env="TESSERACT_LANG")

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def allowed_ext_list(self) -> list[str]:
        return [e.strip().lower() for e in self.allowed_extensions.split(",")]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


settings = Settings()

# Ensure directories exist
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.export_dir).mkdir(parents=True, exist_ok=True)
