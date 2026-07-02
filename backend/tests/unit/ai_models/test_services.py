from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.llm_router.domain.dataclasses import UserModelPreference
from src.llm_router.services import UserModelService


@pytest.fixture
def mock_session():
    return AsyncMock()


@pytest.fixture
def mock_user_preference_repo():
    repo = AsyncMock()
    repo.get_by_id = AsyncMock()
    repo.create = AsyncMock()
    repo.upsert = AsyncMock()
    return repo


@pytest.fixture
def user_preference_service(mock_user_preference_repo, mock_session):
    return UserModelService(user_preference_repo=mock_user_preference_repo, session=mock_session)


def create_user_preference(user_id: UUID, model_id: UUID) -> UserModelPreference:
    return UserModelPreference(user_id=user_id, model_id=model_id)


class TestUserService:
    @pytest.mark.asyncio
    async def test_choose_model_with_created_user(  # noqa: PLR6301
        self,
        user_preference_service,
        mock_user_preference_repo,
    ):
        user_id = uuid4()
        model_id = uuid4()
        user = create_user_preference(user_id=user_id, model_id=model_id)
        mock_user_preference_repo.get_by_id.return_value = user

        preference = await user_preference_service.choose_model(user_id, model_id)

        assert preference.user_id == user_id
        assert preference.model_id == model_id

    @pytest.mark.asyncio
    async def test_choose_model_without_created_user(  # noqa: PLR6301
        self,
        user_preference_service,
        mock_user_preference_repo,
    ):
        user_id = uuid4()
        model_id = uuid4()
        user = create_user_preference(user_id=user_id, model_id=model_id)
        mock_user_preference_repo.get_by_id.return_value = None
        mock_user_preference_repo.create.return_value = user

        preference = await user_preference_service.choose_model(user_id, model_id)

        assert preference.user_id == user_id
        assert preference.model_id == model_id
