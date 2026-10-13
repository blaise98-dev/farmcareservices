import sys
import logging
from pydantic_settings import BaseSettings
from typing import List

logger = logging.getLogger(__name__)

_INSECURE_SECRET = "moome-secret-key-change-in-production"


class Settings(BaseSettings):
    # "development" (default) or "production" — set ENV=production in the
    # deployed .env so an insecure SECRET_KEY refuses to boot instead of
    # just warning.
    ENV: str = "development"

    # Connect via SSH tunnel: localhost:DB_PORT → remote MySQL
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_REMOTE_HOST: str = ""
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "MooMeSystem"
    SECRET_KEY: str = _INSECURE_SECRET
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

    # Contact Us — inbox that receives public contact-form submissions
    CONTACT_EMAIL: str = "bnindenkimana2@gmail.com"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# Refuse to boot with the shipped default SECRET_KEY once ENV=production —
# JWTs signed with a publicly-known key are forgeable. Local dev keeps the
# soft warning so a fresh checkout still runs without any .env.
if settings.SECRET_KEY == _INSECURE_SECRET:
    if settings.ENV == "production":
        raise RuntimeError(
            "SECURITY: refusing to start with the default SECRET_KEY while ENV=production. "
            "Set a strong SECRET_KEY in backend/.env (see rotate-secrets.yml or "
            "`openssl rand -hex 32`)."
        )
    logger.warning(
        "SECURITY WARNING: SECRET_KEY is set to the insecure default. "
        "Set a strong SECRET_KEY in your .env file before deploying to production."
    )

