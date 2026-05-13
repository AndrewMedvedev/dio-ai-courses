from fastapi import APIRouter

from src.courses.domain.exceptions import CourseProviderUnavailableError
from src.courses.schemas import ModelCatalogItemOut
from src.core.model_catalog import ModelsProviderUnavailableError, model_catalog_payload

router = APIRouter(prefix="/models", tags=["Модели"])


@router.get("", response_model=list[ModelCatalogItemOut], summary="Получить каталог моделей")
def get_models() -> list[ModelCatalogItemOut]:
    """Получение каталога доступных LLM-моделей."""

    try:
        return [ModelCatalogItemOut(**item) for item in model_catalog_payload()]
    except ModelsProviderUnavailableError as exc:
        raise CourseProviderUnavailableError(str(exc)) from exc
