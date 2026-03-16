from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str = Field(default="", env="ANTHROPIC_API_KEY")
    claude_model: str = Field(default="claude-3-5-haiku-latest", env="CLAUDE_MODEL")

    # Database
    database_url: str = Field(default="sqlite:////data/app.db", env="DATABASE_URL")

    # Storage
    upload_dir: str = Field(default="/data/uploads", env="UPLOAD_DIR")
    export_dir: str = Field(default="/data/exports", env="EXPORT_DIR")
    max_upload_size_mb: int = Field(default=20, env="MAX_UPLOAD_SIZE_MB")

    # App
    base_url: str = Field(default="http://localhost:3000", env="BASE_URL")
    allowed_extensions: str = Field(default="pdf,jpg,jpeg,png", env="ALLOWED_EXTENSIONS")

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
