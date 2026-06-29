from typing import Final

from langchain_openai import ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import SecretStr

# model: Final[ChatOpenAI] = ChatOpenAI(
#     api_key=SecretStr(settings.yandex_cloud.api_key),
#     base_url=settings.yandex_cloud.base_url,
#     model=settings.yandex_cloud.gpt_oss_120b,
#     temperature=0.2,
#     max_retries=3,
#     max_completion_tokens=120000,
# )
model: Final[ChatOpenAI] = ChatOpenAI(
    base_url="http://10.1.50.193:1234/v1",
    model="qwen/qwen3.6-27b",
    api_key=SecretStr("dummy"),
    temperature=0.2,
    max_retries=3,
    max_completion_tokens=250000,
)

splitter = RecursiveCharacterTextSplitter(chunk_size=1024, chunk_overlap=50, length_function=len)
