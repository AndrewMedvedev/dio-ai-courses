from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.courses.application.enrollment.dtos.invitation import InvitationResponse
from src.courses.domain.enrollment.vo import MemberRole
from src.shared.domain.vo import Email


def invitation_fields(email: object) -> dict[str, object]:
    return {
        "id": uuid4(),
        "course_id": uuid4(),
        "email": email,
        "role": MemberRole.STUDENT,
        "user_id": None,
        "invited_by": uuid4(),
        "created_at": datetime(2026, 11, 17, tzinfo=UTC),
        "expires_at": datetime(2026, 11, 24, tzinfo=UTC),
    }


@pytest.mark.parametrize("email", [Email("student@example.com"), "student@example.com"])
@pytest.mark.parametrize("from_attributes", [False, True])
def test_response_unwraps_email_and_serializes_to_string(
    email: Email | str, from_attributes: bool
) -> None:
    fields = invitation_fields(email)
    source = SimpleNamespace(**fields) if from_attributes else fields

    response = InvitationResponse.model_validate(source)

    assert response.email == "student@example.com"
    assert response.model_dump(mode="json", by_alias=True)["email"] == "student@example.com"


@pytest.mark.parametrize("email", ["invalid-email", None, 123, {"value": "student@example.com"}])
def test_response_preserves_email_validation(email: object) -> None:
    with pytest.raises(ValidationError):
        InvitationResponse.model_validate(invitation_fields(email))
