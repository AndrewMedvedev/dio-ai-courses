from typing import Literal

from pathlib import Path

import pytz  # type: ignore  # ruff:ignore[blanket-type-ignore]
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

TIMEZONE = "Asia/Yekaterinburg"
timezone = pytz.timezone(TIMEZONE)

BASE_DIR = Path(__file__).resolve().parent.parent.parent

ENV_FILE = BASE_DIR / ".env"

ENV_DEV_FILE = BASE_DIR / ".env.dev"  # Среда для разработки

load_dotenv(ENV_FILE)

TEMPLATES_DIR = BASE_DIR / "templates"
# Имя основного S3 бакета
S3_BUCKET_NAME = "diocon-tickets-uploads"
S3_BACKUPS_BUCKET_NAME = "diocon-tickets-backups"


class PostgresSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="POSTGRES_")

    host: str = "postgres"
    port: int = 5432
    user: str = "<USER>"
    password: str = "<PASSWORD>"
    db: str = "<DB>"
    driver: Literal["asyncpg"] = "asyncpg"

    @property
    def sqlalchemy_url(self) -> str:
        return f"postgresql+{self.driver}://{self.user}:{self.password}@{self.host}:{self.port}/{self.db}"


class QdrantSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="QDRANT_")

    host: str = "localhost"
    port: int = 6379
    password: str = "<PASSWORD>"

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"


class RabbitSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RABBIT_")

    host: str = "localhost"
    port: int = 5672
    user: str = "guest"
    password: str = "quest"

    @property
    def url(self) -> str:
        return f"amqp://{self.user}:{self.password}@{self.host}:{self.port}/"


class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REDIS_")

    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: str = "<PASSWORD>"

    @property
    def url(self) -> str:
        return f"redis://{self.host}:{self.port}/{self.db}"


class JWTSettings(BaseSettings):
    algorithm: str = "HS256"
    access_token_expires_in_minutes: int = 15
    refresh_token_expires_in_days: int = 30


class MailSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MAIL_")

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_use_tls: bool = False
    smtp_user: str = ""
    smtp_password: str = ""
    default_from_email: str = "diocon@mail.ru"
    support_email: str = "diocon.support@mail.ru"


class ImgProxySettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IMGPROXY_")

    host: str = "localhost"
    port: int = 8081
    key: str = "<KEY>"
    salt: str = "<SALT>"

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"


class ProxyApi(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PROXY_API_")

    key: str = "<API_KEY>"
    base_url: str = "https://openai.api.proxyapi.ru/v1"


class YandexCloudSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="YANDEX_CLOUD_")

    folder_id: str = "<FOLDER_ID>"
    api_key: str = "<API_KEY>"
    base_url: str = "https://llm.api.cloud.yandex.net/v1"

    access_key_id: str = "<ACCESS_KEY_ID>"
    secret_access_key: str = "<SECRET_ACCESS_KEY>"
    endpoint_url: str = "https://storage.yandexcloud.net/"


class LangSmithSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LANGSMITH_")
    tracing: bool = True
    endpoint: str = ""
    api_key: str = ""
    project: str = ""


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_")

    name: str = "ДИО-Консалт"
    port: int = 8000

    @property
    def url(self) -> str:
        return f"http://localhost:{self.port}"

    @property
    def api_url(self) -> str:
        return f"{self.url}/api/v1"


class AdminSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ADMIN_")

    email: str = "admin@admin.com"
    password: str = "admin"


class SearchSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_SEARCH_")

    family_mode: Literal[
        "FAMILY_MODE_NONE",
        "FAMILY_MODE_MODERATE",
        "FAMILY_MODE_STRICT",
    ] = "FAMILY_MODE_NONE"


class EmbeddingsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EMBEDDINGS_")

    base_url: str = "http://localhost:7997/"
    model_name: str = "deepvk/USER-bge-m3"
    dimensions: int = 1024


class RerankersSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RERANKERS_")

    base_url: str = "http://localhost:7998/"
    model_name: str = "BAAI/bge-reranker-v2-m3"


class Settings(BaseSettings):
    secret_key: str = "<SECRET_KEY>"
    frontend_url: str = "http://localhost:3000"

    app: AppSettings = AppSettings()
    postgres: PostgresSettings = PostgresSettings()
    qdrant: QdrantSettings = QdrantSettings()
    rabbit: RabbitSettings = RabbitSettings()
    redis: RedisSettings = RedisSettings()
    jwt: JWTSettings = JWTSettings()
    mail: MailSettings = MailSettings()
    imgproxy: ImgProxySettings = ImgProxySettings()
    proxy_api: ProxyApi = ProxyApi()
    yandex_cloud: YandexCloudSettings = YandexCloudSettings()
    admin: AdminSettings = AdminSettings()
    search: SearchSettings = SearchSettings()
    tracing: LangSmithSettings = LangSmithSettings()
    embeddings: EmbeddingsSettings = EmbeddingsSettings()
    rerankers: RerankersSettings = RerankersSettings()
    base_llm_router_url: str = "http://localhost:8000/api/v1/"
    chromium_ws_endpoint: str = "ws://localhost:3000/playwright/chromium"
    text_ai_model: str = "gpt-4.1-nano"
    image_ai_model: str = "gpt-image-2"


settings = Settings()
