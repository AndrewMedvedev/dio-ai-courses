"""Isolated endpoint checks: do not import src/__init__.py or start the app."""

import ast
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException, status


@pytest.fixture
def update_theory_session():
    # Execute the real endpoint body without importing src (which initializes the app).
    path = Path(__file__).resolve().parents[3] / "src/courses/api/learning/v1/theory_session.py"
    tree = ast.parse(path.read_text())
    endpoint = next(
        node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "update"
    )
    endpoint.decorator_list = []
    module = ast.Module(
        body=[
            ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0),
            endpoint,
        ],
        type_ignores=[],
    )
    namespace = {"HTTPException": HTTPException, "status": status}
    exec(compile(ast.fix_missing_locations(module), str(path), "exec"), namespace)
    return namespace["update"]


def session_fakes(owner_id):
    theory_session_id = uuid4()
    theory_session = SimpleNamespace(id=theory_session_id, user_id=owner_id, edit=Mock())
    repo = SimpleNamespace(read=AsyncMock(return_value=theory_session), update=AsyncMock())
    db = SimpleNamespace(commit=AsyncMock())
    dto = SimpleNamespace(model_dump=Mock(return_value={"active_time_seconds": 30}))
    return theory_session_id, theory_session, repo, db, dto


@pytest.mark.asyncio
async def test_owner_can_update_own_theory_session(update_theory_session):
    owner_id = uuid4()
    theory_session_id, theory_session, repo, db, dto = session_fakes(owner_id)

    result = await update_theory_session(
        _identity=SimpleNamespace(id=owner_id),
        repo=repo,
        session=db,
        theory_session_id=theory_session_id,
        dto=dto,
    )

    assert result is theory_session
    repo.read.assert_awaited_once_with(uid=theory_session_id)
    theory_session.edit.assert_called_once_with(active_time_seconds=30)
    repo.update.assert_awaited_once_with(theory_session)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.xfail(strict=True, reason="BUG-C01: PUT theory session omits ownership check")
async def test_other_user_cannot_update_theory_session(update_theory_session):
    owner_id = uuid4()
    theory_session_id, theory_session, repo, db, dto = session_fakes(owner_id)
    identity = SimpleNamespace(id=uuid4())

    try:
        await update_theory_session(
            _identity=identity,
            repo=repo,
            session=db,
            theory_session_id=theory_session_id,
            dto=dto,
        )
    except Exception as exc:
        assert getattr(exc, "status_code", None) in {403, 404}
    else:
        pytest.fail("Foreign theory session update was accepted")

    repo.read.assert_awaited_once_with(uid=theory_session_id)
    theory_session.edit.assert_not_called()
    repo.update.assert_not_awaited()
    db.commit.assert_not_awaited()
