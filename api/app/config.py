from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://app:dev@db:5432/actes"
    UPLOAD_DIR: str = "/data/uploads"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    ADMIN_EMAIL: str = "admin@local"
    ADMIN_PASSWORD: str = "admin123"
    CORS_ORIGINS: str = "http://localhost:3000"
    MAX_UPLOAD_MB: int = 20

settings = Settings()
