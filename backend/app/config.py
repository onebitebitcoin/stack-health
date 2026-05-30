from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    # Database
    database_url: str = "sqlite:///./dev.db"

    # JWT
    secret_key: str
    access_token_expire_minutes: int = 10080

    # Cloudflare R2
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_public_url: str = ""

    # Admin
    admin_secret_key: str

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # Redis
    redis_url: str = ""

    # App
    # APP_URL: the publicly reachable base URL of this backend server.
    # Used as the redirect_uri base for Google OAuth.
    # IMPORTANT: Register "{APP_URL}/api/v1/auth/google/callback" in Google Cloud Console
    #   → APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs
    app_url: str = "http://localhost:5173"
    app_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"
    environment: str = "development"
    port: int = 8000


settings = Settings()
