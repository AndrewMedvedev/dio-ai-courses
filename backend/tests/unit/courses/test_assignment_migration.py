import importlib.util
from io import StringIO
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "migrations"
    / "versions"
    / ("7c65a066b001_course_settings_and_assignments.py")
)


def test_migration_upgrade_and_downgrade_generate_valid_postgresql_sql():
    spec = importlib.util.spec_from_file_location("assignment_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "61535f8caba7"
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        module.upgrade()
        upgrade = output.getvalue()
        output.seek(0)
        output.truncate()
        module.downgrade()
        downgrade = output.getvalue()
    for name in (
        "assignments",
        "assignment_versions",
        "assignment_settings",
        "assignment_attempts",
        "assignment_evaluations",
    ):
        assert f"CREATE TABLE {name}" in upgrade
        assert f"DROP TABLE {name}" in downgrade
    assert "CREATE TABLE course_settings" not in upgrade
    assert "ALTER TABLE courses ADD COLUMN visibility" in upgrade
    assert "FOREIGN KEY(current_version_id) REFERENCES assignment_versions" in upgrade
    assert "DROP CONSTRAINT fk_assignment_current_version" in downgrade
    for enum in module._ENUMS:
        assert upgrade.count(f"CREATE TYPE {enum.name} AS ENUM") == 1
        assert downgrade.count(f"DROP TYPE {enum.name}") == 1
