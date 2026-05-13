from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass
from urllib import error, request


class ModelsProviderUnavailableError(RuntimeError):
    """Настроенный OpenAI-совместимый провайдер недоступен."""


@dataclass(frozen=True, slots=True)
class ModelCatalogItem:
    """Элемент каталога LLM-моделей, доступный для генерации курсов."""

    id: str
    label: str
    description: str
    recommended: bool = False


OPENAI_MODELS: tuple[ModelCatalogItem, ...] = (
    ModelCatalogItem(
        id="gpt-4.1-mini",
        label="GPT-4.1 mini",
        description="Сбалансированная стоимость и качество для большинства задач генерации курсов.",
        recommended=True,
    ),
    ModelCatalogItem(
        id="gpt-4.1",
        label="GPT-4.1",
        description="Более высокое качество и глубина рассуждений для сложных курсов.",
    ),
    ModelCatalogItem(
        id="gpt-4o-mini",
        label="GPT-4o mini",
        description="Быстрый и экономичный вариант для черновиков.",
    ),
    ModelCatalogItem(
        id="gpt-4o",
        label="GPT-4o",
        description="Сильная мультимодальная модель с высоким качеством результата.",
    ),
    ModelCatalogItem(
        id="o4-mini",
        label="o4-mini",
        description="Модель с упором на рассуждение для задач структурного планирования.",
    ),
)

_CLOUD_MODELS_CACHE: tuple[ModelCatalogItem, ...] = ()
_CLOUD_MODELS_CACHE_EXPIRES_AT: float = 0.0
_CACHE_TTL_SECONDS = 60.0
_LAST_CLOUD_MODELS_ERROR: str | None = None


def _yandex_compatible_models() -> tuple[ModelCatalogItem, ...]:
    """Формирование статических URI моделей Yandex Cloud по каталогу из env."""

    folder_id = os.getenv("YANDEX_FOLDER_ID", "").strip()
    if not folder_id:
        return ()

    return (
        ModelCatalogItem(
            id=f"gpt://{folder_id}/yandexgpt/latest",
            label="YandexGPT latest",
            description="URI модели Yandex Cloud для OpenAI-совместимого API.",
        ),
        ModelCatalogItem(
            id=f"gpt://{folder_id}/yandexgpt/rc",
            label="YandexGPT rc",
            description="Канал release-candidate модели YandexGPT.",
        ),
        ModelCatalogItem(
            id=f"gpt://{folder_id}/qwen3-235b-a22b-fp8/latest",
            label="Qwen3 235B (Yandex)",
            description="Большая открытая модель, доступная через Yandex AI Studio.",
        ),
    )


def _static_model_lookup() -> dict[str, ModelCatalogItem]:
    """Сбор быстрых соответствий по статически известным моделям."""

    return {item.id: item for item in OPENAI_MODELS + _yandex_compatible_models()}


def _provider_configured() -> bool:
    """Проверка, что внешний OpenAI-совместимый провайдер настроен."""

    return bool(os.getenv("OPENAI_BASE_URL", "").strip() and os.getenv("OPENAI_API_KEY", "").strip())


def _models_endpoint(base_url: str) -> str:
    """Построение endpoint каталога моделей из базового URL провайдера."""

    clean = base_url.strip().rstrip("/")
    if clean.endswith("/models"):
        return clean
    return f"{clean}/models"


def _provider_model_to_catalog_item(
    model_id: str,
    static_lookup: dict[str, ModelCatalogItem],
) -> ModelCatalogItem:
    """Преобразование модели провайдера в элемент каталога с локальным описанием."""

    known = static_lookup.get(model_id)
    if known is not None:
        return known

    return ModelCatalogItem(
        id=model_id,
        label=model_id,
        description="Модель, найденная у настроенного OpenAI-совместимого провайдера.",
    )


def _fetch_cloud_models_uncached() -> tuple[ModelCatalogItem, ...]:
    """Получение списка моделей напрямую у провайдера без учета локального кеша."""

    base_url = os.getenv("OPENAI_BASE_URL", "").strip()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not base_url or not api_key:
        return ()

    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    folder_id = os.getenv("YANDEX_FOLDER_ID", "").strip()
    if folder_id:
        # Yandex OpenAI compatibility может ограничивать список моделей каталогом.
        headers["OpenAI-Project"] = folder_id
        headers["x-folder-id"] = folder_id

    endpoint = _models_endpoint(base_url)
    req = request.Request(endpoint, headers=headers, method="GET")

    try:
        with request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        raise ModelsProviderUnavailableError(
            f"Provider HTTP {exc.code} at {endpoint}. {body[:400]}"
        ) from exc
    except error.URLError as exc:
        raise ModelsProviderUnavailableError(
            f"Provider network error at {endpoint}: {exc.reason}"
        ) from exc
    except (TimeoutError, json.JSONDecodeError) as exc:
        raise ModelsProviderUnavailableError(
            f"Provider invalid/timeout response at {endpoint}: {exc}"
        ) from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise ModelsProviderUnavailableError(
            f"Provider response at {endpoint} does not contain a valid 'data' list."
        )

    static_lookup = _static_model_lookup()
    items: list[ModelCatalogItem] = []
    seen: set[str] = set()

    for entry in data:
        if not isinstance(entry, dict):
            continue
        model_id = entry.get("id")
        if not isinstance(model_id, str) or not model_id.strip():
            continue
        model_id = model_id.strip()
        if model_id in seen:
            continue
        seen.add(model_id)
        items.append(_provider_model_to_catalog_item(model_id, static_lookup))

    if items and not any(item.recommended for item in items):
        preferred_id = next(
            (item.id for item in items if item.id.endswith("/yandexgpt/latest")),
            items[0].id,
        )
        items = [
            ModelCatalogItem(
                id=item.id,
                label=item.label,
                description=item.description,
                recommended=(item.id == preferred_id),
            )
            for item in items
        ]

    return tuple(items)


def _cloud_models() -> tuple[ModelCatalogItem, ...]:
    """Получение моделей провайдера с коротким кешированием результата."""

    global _CLOUD_MODELS_CACHE
    global _CLOUD_MODELS_CACHE_EXPIRES_AT
    global _LAST_CLOUD_MODELS_ERROR

    now = time.time()
    if now < _CLOUD_MODELS_CACHE_EXPIRES_AT:
        return _CLOUD_MODELS_CACHE

    try:
        models = _fetch_cloud_models_uncached()
        _LAST_CLOUD_MODELS_ERROR = None
        _CLOUD_MODELS_CACHE = models
    except ModelsProviderUnavailableError as exc:
        _LAST_CLOUD_MODELS_ERROR = str(exc)
        _CLOUD_MODELS_CACHE = ()

    if _CLOUD_MODELS_CACHE:
        _CLOUD_MODELS_CACHE_EXPIRES_AT = now + _CACHE_TTL_SECONDS
    else:
        # Быстро повторяем запрос, если провайдер временно недоступен при старте.
        _CLOUD_MODELS_CACHE_EXPIRES_AT = now + 5.0
    return _CLOUD_MODELS_CACHE


def last_cloud_models_error() -> str | None:
    """Получение последней ошибки загрузки моделей внешнего провайдера."""

    return _LAST_CLOUD_MODELS_ERROR


def all_catalog_models() -> tuple[ModelCatalogItem, ...]:
    """Получение итогового каталога моделей с учетом настроенного провайдера."""

    cloud_models = _cloud_models()
    if cloud_models:
        return cloud_models
    if _provider_configured():
        raise ModelsProviderUnavailableError(
            last_cloud_models_error() or "Настроенный OpenAI-совместимый провайдер недоступен."
        )
    return OPENAI_MODELS + _yandex_compatible_models()


def default_model_id() -> str:
    """Получение модели по умолчанию для генерации курса."""

    models = all_catalog_models()
    for item in models:
        if item.recommended:
            return item.id
    return models[0].id


def is_supported_model(model_id: str) -> bool:
    """Проверка, что модель доступна в текущем каталоге."""

    return any(item.id == model_id for item in all_catalog_models())


def model_catalog_payload() -> list[dict[str, object]]:
    """Подготовка каталога моделей к выдаче через API."""

    return [asdict(item) for item in all_catalog_models()]
