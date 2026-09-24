from uuid import UUID, uuid4

import pytest

from src.feedback.domain.entities import Feedback


@pytest.fixture
def user_id() -> UUID:
    return uuid4()


@pytest.fixture
def feedback(user_id: UUID) -> Feedback:
    return Feedback.create(
        user_id=str(user_id),
        email="user@example.com",
        rating=5,
        comment="Хорошая платформа",
    )
