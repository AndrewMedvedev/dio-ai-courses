from datetime import datetime, timedelta

import pytest

from src.iam.domain.dataclasses import Invitation
from src.shared.utils.time import current_datetime, get_expiration_time


@pytest.fixture
def valid_email():
    return "govnoed1234@.com"


@pytest.fixture
def future_expires_at():
    return current_datetime() + timedelta(days=7)


@pytest.fixture
def past_expires_at():
    return current_datetime() - timedelta(hours=1)


def test_create_invitation():
    invitation = Invitation(
        email="govnoed1234@.com", expires_at=get_expiration_time(timedelta(days=7))
    )

    assert invitation.email == "govnoed1234@.com"

    assert invitation.is_used is False
    assert invitation.used_at is None
    assert invitation.is_valid is True


def test_is_valid_false_when_used_invitation(future_expires_at: datetime, valid_email: str):
    invitation = Invitation(
        email=valid_email,
        expires_at=future_expires_at,
    )
    invitation.mark_as_used()
    assert invitation.is_valid is False


def test_is_valid_false_when_used_and_expired_invitation(
    past_expires_at: datetime, valid_email: str
):
    invitation = Invitation(
        email=valid_email,
        expires_at=past_expires_at,
    )
    invitation.mark_as_used()
    assert invitation.is_valid is False


def test_mark_as_used_sets_fields_correctly_invitation(
    future_expires_at: datetime, valid_email: str
):
    before = current_datetime()
    invitation = Invitation(
        email=valid_email,
        expires_at=future_expires_at,
    )

    invitation.mark_as_used()

    after = current_datetime()

    assert invitation.is_used is True
    assert invitation.used_at is not None
    assert before <= invitation.used_at <= after
    assert invitation.is_valid is False


def test_token_generated_by_default_factory_invitation(
    future_expires_at: datetime, valid_email: str
):
    first_invitation = Invitation(
        email=valid_email,
        expires_at=future_expires_at,
    )
    second_invitation = Invitation(
        email="joponyx@.com",
        expires_at=future_expires_at,
    )

    min_token_length = 20

    assert first_invitation.token != second_invitation.token
    assert len(first_invitation.token) >= min_token_length
