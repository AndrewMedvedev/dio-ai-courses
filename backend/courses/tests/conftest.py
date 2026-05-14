from __future__ import annotations

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

TEST_DB_URL = "sqlite:///./.test_course.db"
os.environ["COURSES_DATABASE_URL"] = TEST_DB_URL

import src.core.model_catalog as model_catalog
from src.courses.dependencies import get_db
from src.infra.db.base import Base
from src.main import app


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def reset_model_catalog_state():
    model_catalog._CLOUD_MODELS_CACHE = ()
    model_catalog._CLOUD_MODELS_CACHE_EXPIRES_AT = 0.0
    model_catalog._LAST_CLOUD_MODELS_ERROR = None
    yield
    model_catalog._CLOUD_MODELS_CACHE = ()
    model_catalog._CLOUD_MODELS_CACHE_EXPIRES_AT = 0.0
    model_catalog._LAST_CLOUD_MODELS_ERROR = None


@pytest.fixture
def db_session(test_engine) -> Generator[Session, None, None]:
    # Fresh schema per test keeps integration tests isolated.
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    testing_session_local = sessionmaker(
        bind=test_engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    db = testing_session_local()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as api_client:
        yield api_client
    app.dependency_overrides.clear()
