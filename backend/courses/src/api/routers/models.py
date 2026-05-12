from fastapi import APIRouter, HTTPException

from src.app.schemas.courses import ModelCatalogItemOut
from src.core import ModelsProviderUnavailableError, model_catalog_payload

router = APIRouter(prefix="/models", tags=["Models"])


@router.get("", response_model=list[ModelCatalogItemOut])
def get_models() -> list[ModelCatalogItemOut]:
    try:
        return [ModelCatalogItemOut(**item) for item in model_catalog_payload()]
    except ModelsProviderUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
