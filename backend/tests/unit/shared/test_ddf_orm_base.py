import pytest
from ddf.infra.database.sqlalchemy.base import Base as DdfBase
from sqlalchemy import DateTime

from src.core.database import Base, import_all_models
from src.core.settings import INSTALLED_MODULES
from src.courses.infra.database.models import CourseOrm
from src.iam.infra.database.models import UserOrm
from src.media.infra.database.models import StoredObjectOrm
from src.notifications.infra.database.models import NotificationOrm
from src.organization.infra.database.models import OrganizationOrm

UUID4_VERSION = 4


def test_project_base_uses_ddf_registry_and_metadata() -> None:
    import_all_models(INSTALLED_MODULES)

    assert issubclass(Base, DdfBase)
    assert Base.registry is DdfBase.registry
    assert Base.metadata is DdfBase.metadata
    assert all(mapper.class_.metadata is Base.metadata for mapper in Base.registry.mappers)


@pytest.mark.parametrize(
    "model", [CourseOrm, UserOrm, StoredObjectOrm, NotificationOrm, OrganizationOrm]
)
def test_orm_id_preserves_uuid4_and_postgresql_server_default(model: type[Base]) -> None:
    column = model.__table__.c.id

    assert column.primary_key is True
    assert column.nullable is False
    assert column.default is not None
    assert column.default.arg(None).version == UUID4_VERSION
    assert column.server_default is not None
    assert str(column.server_default.arg) == "gen_random_uuid()"


@pytest.mark.parametrize("field", ["created_at", "updated_at", "deleted_at"])
def test_orm_timestamp_columns_preserve_timezone_and_nullability(field: str) -> None:
    column = UserOrm.__table__.c[field]

    assert isinstance(column.type, DateTime)
    assert column.type.timezone is True
    assert column.nullable is (field == "deleted_at")
    if field == "deleted_at":
        assert column.server_default is None
    else:
        assert column.server_default is not None
        assert str(column.server_default.arg) == "now()"


def test_orm_updated_at_preserves_server_expression_on_update() -> None:
    onupdate = UserOrm.__table__.c.updated_at.onupdate

    assert onupdate is not None
    assert str(onupdate.arg) == "now()"


def test_course_foreign_keys_stay_in_the_same_metadata() -> None:
    import_all_models(INSTALLED_MODULES)

    for table_name in ("courses", "modules", "lessons"):
        table = Base.metadata.tables[table_name]
        for foreign_key in table.foreign_keys:
            assert foreign_key.column.table.metadata is Base.metadata
