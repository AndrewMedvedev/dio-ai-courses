import pytest
from ddf.domain.vo.email import Email
from pydantic import TypeAdapter

from src.iam.domain import vo as iam_vo
from src.shared.domain import vo as shared_vo


@pytest.mark.parametrize(
    ("value", "expected"),
    [("user@example.com", "user@example.com"), ("user@EXAMPLE.COM", "user@example.com")],
)
def test_email_normalizes_and_exposes_value(value: str, expected: str) -> None:
    email = Email(value)

    assert email.value == expected
    assert str(email) == expected
    assert email.domain == "example.com"


@pytest.mark.parametrize("value", ["", "   ", "not-an-email", "user@"])
def test_email_rejects_invalid_values(value: str) -> None:
    with pytest.raises(ValueError, match=r"Email cannot be empty|Invalid email address"):
        Email(value)


def test_email_preserves_pydantic_json_round_trip() -> None:
    adapter = TypeAdapter(Email)
    email = Email("user@example.com")

    encoded = adapter.dump_json(email)

    assert encoded == b'{"value":"user@example.com"}'
    assert adapter.validate_json(encoded) == email


@pytest.mark.parametrize("module", [iam_vo, shared_vo])
def test_local_email_implementations_are_removed(module) -> None:
    assert not hasattr(module, "Email")
