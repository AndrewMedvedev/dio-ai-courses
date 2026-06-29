import asyncio
from collections.abc import Callable
from dataclasses import dataclass

from openai import AsyncOpenAI

from ..core.settings import settings


@dataclass
class StructuredTool:
    func: Callable
    name: str
    args_schema: dict


client = AsyncOpenAI(
    api_key=settings.proxy_api_key,
    base_url="https://openai.api.proxyapi.ru/v1",
    max_retries=3,
)


async def main():
    result = client.models
    lst = await result.list()
    print(len(lst.data))


asyncio.run(main())
