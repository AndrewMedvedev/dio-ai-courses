from aiohttp import ClientSession

from ..core.constants import STATUS_OK
from ..core.settings import settings

YANDEX_CLOUD_AI_MODELS_URL = "https://llm.api.cloud.yandex.net/v1/models"


def format_answer(data: list[str]) -> set:
    models: list = []
    for i in data:
        if (
            isinstance(i, dict)
            and (name := i.get("id", ""))
            and name.startswith("gpt://")
            and len(name) > 1
        ):
            *_, model, status = name.split("/")
            if status != "deprecated":
                models.append(model)
    return set(models)


async def get_yandex_ai_models() -> set:
    async with (
        ClientSession() as session,
        session.get(
            url=YANDEX_CLOUD_AI_MODELS_URL,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {settings.yandex_cloud.api_key}",
                "x-folder-id": settings.yandex_cloud.folder_id,
                "OpenAI-Project": settings.yandex_cloud.folder_id,
            },
        ) as data,
    ):
        if data.status != STATUS_OK:
            raise ValueError(f"Yandex API {data.status}: {await data.text()}")
        response = (await data.json()).get("data", [])
        return format_answer(response)
