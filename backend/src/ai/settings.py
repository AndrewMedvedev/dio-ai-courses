from __future__ import annotations

from pathlib import Path
from typing import Literal

import pytz
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

TIMEZONE = pytz.timezone("Europe/Moscow")
BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BASE_DIR / ".env"
CHROMA_PATH = BASE_DIR / ".chroma"

load_dotenv(ENV_PATH)


class YandexCloudSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="YANDEX_CLOUD_")

    folder_id: str = ""
    api_key: str = ""
    base_url: str = "https://llm.api.cloud.yandex.net/v1"

    @property
    def gemma_3_27b_it(self) -> str:
        return f"gpt://{self.folder_id}/gemma-3-27b-it/latest"

    @property
    def aliceai_llm(self) -> str:
        return f"gpt://{self.folder_id}/aliceai-llm"

    @property
    def qwen3_235b(self) -> str:
        return f"gpt://{self.folder_id}/qwen3-235b-a22b-fp8/latest"

    @property
    def yandexgpt_rc(self) -> str:
        return f"gpt://{self.folder_id}/yandexgpt/rc"


class DeepSeekSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DEEPSEEK_")

    api_key: str = ""
    base_url: str = "https://api.deepseek.com"

    @property
    def deepseek_chat(self) -> str:
        return "deepseek-chat"


class HuggingFaceSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HF_")

    space_url: str = "http://localhost:8001"


class SearchSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_SEARCH_")

    family_mode: Literal[
        "FAMILY_MODE_NONE",
        "FAMILY_MODE_MODERATE",
        "FAMILY_MODE_STRICT",
    ] = "FAMILY_MODE_NONE"


class Settings(BaseSettings):
    yandexcloud: YandexCloudSettings = YandexCloudSettings()
    deepseek: DeepSeekSettings = DeepSeekSettings()
    huggingface: HuggingFaceSettings = HuggingFaceSettings()
    search: SearchSettings = SearchSettings()


settings = Settings()
