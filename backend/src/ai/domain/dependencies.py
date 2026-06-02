from typing import Final

from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from ...core.settings import settings

model: Final[ChatOpenAI] = ChatOpenAI(
    api_key=SecretStr(settings.yandex_cloud.api_key),
    base_url=settings.yandex_cloud.base_url,
    model=settings.yandex_cloud.gpt_oss_120b,
    temperature=0.2,
    max_retries=3,
    max_completion_tokens=125000,
)
