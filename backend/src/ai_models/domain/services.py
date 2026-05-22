from uuid import UUID

from .dataclasses import AIModel, UserModelPreference


def create_user_preference(user_id: UUID, model_id: UUID) -> UserModelPreference:
    return UserModelPreference(user_id=user_id, model_id=model_id)


def create_ai_model(
    name: str, provider: str, description: str | None = None, context_parametrs: str | None = None
) -> AIModel:
    return AIModel(
        name=name, provider=provider, description=description, context_parametrs=context_parametrs
    )
