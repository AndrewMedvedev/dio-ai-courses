import asyncio

from openai import AsyncOpenAI

client = AsyncOpenAI(
    api_key="sk-nPlUnqyoREmIDIpD98TQNkO6wPyR7YEC",
    base_url="https://openai.api.proxyapi.ru/v1",
    max_retries=3,
)


async def main():
    result = client.models
    lst = await result.list()
    print(len(lst.data))


asyncio.run(main())
