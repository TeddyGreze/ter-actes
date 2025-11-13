from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Config de base ---
    DATABASE_URL: str = "postgresql://app:dev@db:5432/actes"
    UPLOAD_DIR: str = "/data/uploads"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    ADMIN_EMAIL: str = "admin@local"
    ADMIN_PASSWORD: str = "admin123"
    CORS_ORIGINS: str = "http://localhost:3000"
    MAX_UPLOAD_MB: int = 20

    # --- SMTP / Envoi d'e-mails ---
    SMTP_HOST: Optional[str] = None          # ex: smtp.gmail.com
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None          # ex: ter.saint.andre@gmail.com
    SMTP_PASSWORD: Optional[str] = None      # mot de passe d'application
    SMTP_FROM: Optional[str] = None          # ex: "Portail Actes <...>"
    SMTP_USE_TLS: bool = True                # True pour STARTTLS (port 587)

    # --- URL publique du front (pour construire les liens dans les mails) ---
    PUBLIC_FRONT_BASE_URL: str = "http://localhost:3000"


settings = Settings()
