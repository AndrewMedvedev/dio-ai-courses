from uuid import UUID, uuid4

import pytest
from ddf.domain.vo.email import Email

from src.feedback.domain.entities import Feedback


@pytest.fixture
def user_id() -> UUID:
    return uuid4()


@pytest.fixture
def feedback(user_id: UUID) -> Feedback:
    return Feedback.create(
        user_id=user_id,
        email=Email("user@example.com"),
        rating=5,
        comment="Хорошая платформа",
    )
