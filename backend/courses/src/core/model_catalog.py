from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass
from urllib import error, request


class ModelsProviderUnavailableError(RuntimeError):
    """Configured OpenAI-compatible provider is unavailable."""


@dataclass(frozen=True, slots=True)
class ModelCatalogItem:
    id: str
    label: str
    description: str
    recommended: bool = False


OPENAI_MODELS: tuple[ModelCatalogItem, ...] = (
    ModelCatalogItem(
        id="gpt-4.1-mini",
        label="GPT-4.1 mini",
        description="Balanced cost and quality for most course generation tasks.",
        recommended=True,
    ),
    ModelCatalogItem(
        id="gpt-4.1",
        label="GPT-4.1",
        description="Higher quality and reasoning depth for complex courses.",
    ),
    ModelCatalogItem(
        id="gpt-4o-mini",
        label="GPT-4o mini",
        description="Fast and cost-efficient option for quick drafts.",
    ),
    ModelCatalogItem(
        id="gpt-4o",
        label="GPT-4o",
        description="Strong multimodal-capable model with high quality outputs.",
    ),
    ModelCatalogItem(
        id="o4-mini",
        label="o4-mini",
        description="Reasoning-focused model for structured planning tasks.",
    ),
)

_CLOUD_MODELS_CACHE: tuple[ModelCatalogItem, ...] = ()
_CLOUD_MODELS_CACHE_EXPIRES_AT: float = 0.0
_CACHE_TTL_SECONDS = 60.0
_LAST_CLOUD_MODELS_ERROR: str | None = None


def _yandex_compatible_models() -> tuple[ModelCatalogItem, ...]:
    folder_id = os.getenv("YANDEX_FOLDER_ID", "").strip()
    if not folder_id:
        return ()

    return (
        ModelCatalogItem(
            id=f"gpt://{folder_id}/yandexgpt/latest",
            label="YandexGPT latest",
            description="Yandex Cloud model URI for OpenAI-compatible API.",
        ),
        ModelCatalogItem(
            id=f"gpt://{folder_id}/yandexgpt/rc",
            label="YandexGPT rc",
            description="YandexGPT release-candidate channel.",
        ),
        ModelCatalogItem(
            id=f"gpt://{folder_id}/qwen3-235b-a22b-fp8/latest",
            label="Qwen3 235B (Yandex)",
            description="Large open model served by Yandex AI Studio.",
        ),
    )


def _static_model_lookup() -> dict[str, ModelCatalogItem]:
    return {item.id: item for item in OPENAI_MODELS + _yandex_compatible_models()}


def _provider_configured() -> bool:
    return bool(os.getenv("OPENAI_BASE_URL", "").strip() and os.getenv("OPENAI_API_KEY", "").strip())


def _models_endpoint(base_url: str) -> str:
    clean = base_url.strip().rstrip("/")
    if clean.endswith("/models"):
        return clean
    return f"{clean}/models"


def _provider_model_to_catalog_item(
    model_id: str,
    static_lookup: dict[str, ModelCatalogItem],
) -> ModelCatalogItem:
    known = static_lookup.get(model_id)
    if known is not None:
        return known

    return ModelCatalogItem(
        id=model_id,
        label=model_id,
        description="Model discovered from configured OpenAI-compatible provider.",
    )


def _fetch_cloud_models_uncached() -> tuple[ModelCatalogItem, ...]:
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
        # Yandex OpenAI compatibility may scope model list by folder/project.
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
        # Retry soon when provider is temporarily unavailable during startup.
        _CLOUD_MODELS_CACHE_EXPIRES_AT = now + 5.0
    return _CLOUD_MODELS_CACHE


def last_cloud_models_error() -> str | None:
    return _LAST_CLOUD_MODELS_ERROR


def all_catalog_models() -> tuple[ModelCatalogItem, ...]:
    cloud_models = _cloud_models()
    if cloud_models:
        return cloud_models
    if _provider_configured():
        raise ModelsProviderUnavailableError(
            last_cloud_models_error() or "Configured OpenAI-compatible provider is unavailable."
        )
    return OPENAI_MODELS + _yandex_compatible_models()


def default_model_id() -> str:
    models = all_catalog_models()
    for item in models:
        if item.recommended:
            return item.id
    return models[0].id


def is_supported_model(model_id: str) -> bool:
    return any(item.id == model_id for item in all_catalog_models())


def model_catalog_payload() -> list[dict[str, object]]:
    return [asdict(item) for item in all_catalog_models()]
