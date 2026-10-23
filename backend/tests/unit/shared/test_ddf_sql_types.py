from types import ModuleType

import pytest
from ddf.infra.database.sqlalchemy.types import DatatimeTz, StrUnique
from sqlalchemy import TEXT, DateTime

from src.core.database import Base
from src.iam.infra.database import models as iam
from src.media.infra.database import models as media
from src.organization.infra.database import models as organization


@pytest.mark.parametrize("module", [iam, media, organization])
def test_models_use_ddf_sql_types_directly(module: ModuleType) -> None:
    assert module.DatetimeTz is DatatimeTz
    assert module.StrUnique is StrUnique


@pytest.mark.parametrize(
    ("model", "field", "nullable"),
    [
        (iam.InvitationOrm, "expires_at", False),
        (iam.InvitationOrm, "used_at", True),
        (iam.MembershipOrm, "expires_at", True),
        (media.UploadSessionOrm, "expires_at", False),
        (organization.InvitationOrm, "expires_at", False),
        (organization.InvitationOrm, "used_at", True),
    ],
)
def test_datetime_columns_preserve_timezone_and_nullability(
    model: type[Base],
    field: str,
    nullable: bool,
) -> None:
    column = model.__table__.c[field]

    assert isinstance(column.type, DateTime)
    assert column.type.timezone is True
    assert column.nullable is nullable


def test_iam_string_columns_preserve_constraints() -> None:
    email = iam.UserOrm.__table__.c.email
    username = iam.UserOrm.__table__.c.username
    description = iam.ServiceAccountOrm.__table__.c.description

    assert email.unique is True
    assert email.nullable is False
    assert username.nullable is True
    assert isinstance(description.type, TEXT)
    assert description.nullable is True


@pytest.mark.parametrize(
    "model",
    [media.UploadSessionOrm, media.StoredObjectOrm, organization.InvitationOrm],
)
def test_storage_keys_and_invitation_tokens_remain_unique(model: type[Base]) -> None:
    field = "token" if model is organization.InvitationOrm else "storage_key"
    column = model.__table__.c[field]

    assert column.unique is True
    assert column.nullable is False
