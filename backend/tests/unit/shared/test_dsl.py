import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from ddf.application.dsl import Condition, Group, Negation, Search
from ddf.application.dtos import Sort
from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import DateTime, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from src.shared.application import dtos
from src.shared.dependencies.params import SearchParamsDep
from src.shared.infra.database.repos import sqlalchemy


@pytest.fixture
def dsl():
    class Base(DeclarativeBase):
        pass

    class Item(Base):
        __tablename__ = "dsl_items"
        id: Mapped[UUID] = mapped_column(primary_key=True)
        owner_id: Mapped[UUID]
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
        title: Mapped[str]
        score: Mapped[int]
        active: Mapped[bool]
        note: Mapped[str | None]

    return SimpleNamespace(
        dtos=dtos,
        sqlalchemy=sqlalchemy,
        model=Item,
        fields=("id", "owner_id", "created_at", "title", "score", "active", "note"),
    )


def test_search_params_keeps_pagination_and_parses_ddf_query(dsl):
    params = dsl.dtos.SearchParams.model_validate(
        {
            "page": 2,
            "size": 5,
            "query": {"field": "title", "op": "$ilike", "value": "%Python%"},
            "sort": {"field": "created_at", "direction": "desc"},
        }
    )

    assert params.offset == (params.page - 1) * params.size
    assert isinstance(params.query, Condition)
    assert params.sort == Sort(field="created_at", direction="desc")
    assert dsl.dtos.SearchParams().query is None


def test_get_search_params_accepts_json_without_request_body():
    app = FastAPI()

    @app.get("/items")
    def items(params: SearchParamsDep):
        return params.model_dump(mode="json")

    request_params = {
        "page": 2,
        "size": 3,
        "sort": "-created_at",
        "query": json.dumps({"field": "score", "op": "$gte", "value": 5}),
    }
    with TestClient(app) as client:
        response = client.get("/items", params=request_params)

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["page"] == request_params["page"]
    assert response.json()["query"]["op"] == "$gte"
    assert response.json()["sort"] == {"field": "created_at", "direction": "desc"}
    assert "requestBody" not in app.openapi()["paths"]["/items"]["get"]


@pytest.mark.parametrize("query", ["not-json", "{}", '{"field":"score","op":"$bad"}'])
def test_get_search_params_rejects_invalid_query(query):
    app = FastAPI()

    @app.get("/items")
    def items(params: SearchParamsDep):
        return params.model_dump(mode="json")

    with TestClient(app) as client:
        response = client.get("/items", params={"query": query})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_dsl_preserves_mandatory_scope_and_types_nested_values(dsl):
    owner_id = uuid4()
    query = Group(
        op="$and",
        filters=(
            Condition(field="ownerId", op="$eq", value=str(owner_id)),
            Negation(filter=Condition(field="score", op="$in", value=["1", "2"])),
            Condition(field="createdAt", op="$gte", value="2026-10-20T00:00:00Z"),
        ),
    )
    stmt = select(dsl.model).where(dsl.model.active.is_(True))

    stmt = dsl.sqlalchemy.apply_query(dsl.model, stmt, query, dsl.fields)
    compiled = stmt.compile(dialect=postgresql.dialect())

    assert "active IS true" in str(compiled)
    assert owner_id in compiled.params.values()
    assert [1, 2] in compiled.params.values()
    assert datetime(2026, 10, 20, tzinfo=UTC) in compiled.params.values()


@pytest.mark.parametrize(
    "query",
    [
        Condition(field="unknown", op="$eq", value="x"),
        Condition(field="owner_id", op="$eq", value="not-a-uuid"),
        Condition(field="created_at", op="$eq", value="not-a-date"),
        Condition(field="created_at", op="$eq", value="2026-10-20T00:00:00"),
        Condition(field="score", op="$eq", value="not-a-number"),
        Condition(field="score", op="$like", value="%1%"),
        Condition(field="score", op="$in", value=1),
        Condition(field="score", op="$gt", value=None),
        Group(op="$and", filters=()),
        Search(query="Python"),
    ],
)
def test_invalid_query_fails_before_database(dsl, query):
    with pytest.raises(ValueError, match=r"."):
        dsl.sqlalchemy.apply_query(dsl.model, select(dsl.model), query, dsl.fields)


def test_null_and_full_text_search_use_ddf_compiler(dsl):
    query = Group(
        op="$or",
        filters=(
            Condition(field="note", op="$isNull"),
            Search(query="Python"),
        ),
    )

    stmt = dsl.sqlalchemy.apply_query(
        dsl.model,
        select(dsl.model),
        query,
        dsl.fields,
        text_fields=("title",),
    )
    compiled = stmt.compile(dialect=postgresql.dialect())

    assert "note IS NULL" in str(compiled)
    assert "to_tsvector" in str(compiled)
    assert "plainto_tsquery" in str(compiled)
    assert "Python" in compiled.params.values()


@pytest.mark.asyncio
async def test_paginate_filters_count_and_rows_before_pagination(dsl):
    expected_total = 4
    session = AsyncMock()
    session.scalar.return_value = expected_total
    session.execute.return_value = Mock()
    session.execute.return_value.scalars.return_value.all.return_value = ["row"]
    params = dsl.dtos.SearchParams(
        page=2,
        size=2,
        query=Condition(field="score", op="$gte", value=3),
        sort=Sort(field="createdAt", direction="asc"),
    )

    page = await dsl.sqlalchemy.paginate(
        session,
        dsl.model,
        select(dsl.model).order_by(dsl.model.score.desc()),
        params,
        mapper=lambda row: f"mapped-{row}",
        fields=dsl.fields,
    )

    count_stmt = str(session.scalar.await_args.args[0])
    rows_stmt = str(session.execute.await_args.args[0])
    assert "score >=" in count_stmt
    assert "LIMIT" not in count_stmt
    assert "score >=" in rows_stmt
    assert "ORDER BY dsl_items.created_at ASC" in rows_stmt
    assert "ORDER BY dsl_items.score" not in rows_stmt
    assert "LIMIT" in rows_stmt
    assert "OFFSET" in rows_stmt
    assert page.total == expected_total
    assert page.pages == (expected_total + params.size - 1) // params.size
    assert page.items == ["mapped-row"]


@pytest.mark.asyncio
async def test_paginate_rejects_unknown_sort_even_when_database_empty(dsl):
    session = AsyncMock()
    params = dsl.dtos.SearchParams(sort=Sort(field="__table__", direction="asc"))

    with pytest.raises(ValueError, match="Unknown sort field"):
        await dsl.sqlalchemy.paginate(
            session,
            dsl.model,
            select(dsl.model),
            params,
            fields=dsl.fields,
        )

    session.scalar.assert_not_awaited()
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_paginate_preserves_existing_behavior_without_dsl_opt_in(dsl):
    session = AsyncMock()
    session.scalar.return_value = 0
    params = dsl.dtos.SearchParams(query=Condition(field="unknown", op="$eq", value=1))

    page = await dsl.sqlalchemy.paginate(session, dsl.model, select(dsl.model), params)

    assert page.items == []
    assert "WHERE" not in str(session.scalar.await_args.args[0])
    session.execute.assert_not_awaited()
