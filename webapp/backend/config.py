from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Connect via SSH tunnel: localhost:DB_PORT → remote MySQL
    DB_HOST: str = "localhost"
    DB_PORT: int = 3307
    DB_REMOTE_HOST: str = ""
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "MooMeSystem"
    SECRET_KEY: str = "moome-secret-key-change-in-production"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Password reset
    FRONTEND_URL: str = "http://localhost:5173"
    RESET_TOKEN_EXPIRE_MINUTES: int = 60

    # Email (optional — reset links are logged to console when SMTP_HOST is empty)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    EMAIL_FROM: str = "noreply@moome.rw"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
