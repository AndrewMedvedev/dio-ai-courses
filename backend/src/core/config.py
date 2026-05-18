from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    COURSES_DATABASE_URL: str = "sqlite:///./courses.db"
    OPENAI_API_KEY: str
    OPENAI_BASE_URL: str
    YANDEX_FOLDER_ID: str

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()