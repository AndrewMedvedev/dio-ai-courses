from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from src.courses.application.services.document import DocumentService
from src.courses.domain.enums import DocumentNodeType
from src.courses.infra.database.models import DocumentOrm
from src.courses.infra.database.repos.document import SqlDocumentRepository
from src.courses.utils.docs_processing import split_markdown


@pytest_asyncio.fixture
async def engine(postgres_container) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(postgres_container.get_connection_url())
    async with engine.begin() as connection:
        await connection.run_sync(DocumentOrm.__table__.create)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.run_sync(DocumentOrm.__table__.drop)
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_tocs_returns_only_document_roots_of_owner(session):
    """Возвращает только оглавления документов указанного пользователя."""
    owner_id = uuid4()
    toc = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        node_type=DocumentNodeType.TOC,
        title="Guide",
    )
    heading = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        parent_node_id=toc.id,
        node_type=DocumentNodeType.HEADING,
        title="Chapter",
    )
    other_owner_toc = DocumentOrm(
        id=uuid4(),
        owner_id=uuid4(),
        node_type=DocumentNodeType.TOC,
        title="Other guide",
    )
    session.add_all([toc, heading, other_owner_toc])
    await session.flush()
    repository = SqlDocumentRepository(session)

    documents = await repository.get_tocs(owner_id)

    assert [document.id for document in documents] == [toc.id]


@pytest.mark.asyncio
async def test_get_headings_returns_only_headings_of_owner_toc(session):
    """Возвращает заголовки только указанного оглавления владельца."""
    owner_id = uuid4()
    toc = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        node_type=DocumentNodeType.TOC,
        title="Guide",
    )
    heading = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        parent_node_id=toc.id,
        node_type=DocumentNodeType.HEADING,
        title="Chapter",
    )
    other_toc = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        node_type=DocumentNodeType.TOC,
        title="Other guide",
    )
    other_toc_heading = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        parent_node_id=other_toc.id,
        node_type=DocumentNodeType.HEADING,
        title="Other chapter",
    )
    other_owner_heading = DocumentOrm(
        id=uuid4(),
        owner_id=uuid4(),
        parent_node_id=toc.id,
        node_type=DocumentNodeType.HEADING,
        title="Private chapter",
    )
    session.add_all([toc, heading, other_toc, other_toc_heading, other_owner_heading])
    await session.flush()
    repository = SqlDocumentRepository(session)

    documents = await repository.get_headings(owner_id, toc.id)

    assert [document.id for document in documents] == [heading.id]


@pytest.mark.asyncio
async def test_get_text_returns_content_of_heading(session):
    """Возвращает текст, связанный с указанным заголовком документа."""
    owner_id = uuid4()
    heading_id = uuid4()
    heading = DocumentOrm(
        id=heading_id,
        owner_id=owner_id,
        node_type=DocumentNodeType.HEADING,
        title="Chapter",
    )
    text = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        parent_node_id=heading_id,
        node_type=DocumentNodeType.TEXT,
        content="Chapter content",
    )
    session.add_all([heading, text])
    await session.flush()
    repository = SqlDocumentRepository(session)

    document = await repository.get_text(owner_id, heading_id)

    assert document is not None
    assert document.content == "Chapter content"


@pytest.mark.asyncio
async def test_get_text_does_not_return_content_to_other_owner(session):
    """Не возвращает текст документа пользователю, который им не владеет."""
    owner_id = uuid4()
    heading = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        node_type=DocumentNodeType.HEADING,
        title="Chapter",
    )
    text = DocumentOrm(
        id=uuid4(),
        owner_id=owner_id,
        parent_node_id=heading.id,
        node_type=DocumentNodeType.TEXT,
        content="Private content",
    )
    session.add_all([heading, text])
    await session.flush()
    repository = SqlDocumentRepository(session)

    document = await repository.get_text(uuid4(), heading.id)

    assert document is None


@pytest.mark.asyncio
@pytest.mark.parametrize("same_timestamp", [False, True])
async def test_get_text_returns_all_fragments_in_stable_order(session, same_timestamp):
    owner_id = uuid4()
    heading = DocumentOrm(
        id=uuid4(), owner_id=owner_id, node_type=DocumentNodeType.HEADING, title="Chapter",
    )
    created_at = datetime(2026, 10, 28, tzinfo=UTC)
    fragments = [
        DocumentOrm(
            id=UUID(int=index + 1),
            owner_id=owner_id,
            parent_node_id=heading.id,
            node_type=DocumentNodeType.TEXT,
            content=content,
            created_at=created_at if same_timestamp else created_at + timedelta(seconds=index),
        )
        for index, content in enumerate(["First fragment", "Second fragment", "Third fragment"])
    ]
    private_fragment = DocumentOrm(
        owner_id=uuid4(), parent_node_id=heading.id,
        node_type=DocumentNodeType.TEXT, content="Private fragment",
    )
    session.add_all([heading, *reversed(fragments), private_fragment])
    await session.flush()

    document = await SqlDocumentRepository(session).get_text(owner_id, heading.id)

    assert document is not None
    assert document.id == fragments[0].id
    assert document.content == "First fragment\n\nSecond fragment\n\nThird fragment"
    assert fragments[0].content == "First fragment"
    stored_first = await session.scalar(
        select(DocumentOrm).where(DocumentOrm.id == fragments[0].id),
    )
    assert stored_first is not None
    assert stored_first.content == "First fragment"


@pytest.mark.asyncio
@pytest.mark.parametrize("node_type", [DocumentNodeType.TOC, DocumentNodeType.HEADING])
async def test_hierarchy_nodes_are_ordered_by_creation_time_and_id(session, node_type):
    owner_id = uuid4()
    parent = DocumentOrm(
        id=uuid4(), owner_id=owner_id, node_type=DocumentNodeType.TOC, title="Parent",
    )
    created_at = datetime(2026, 10, 28, tzinfo=UTC)
    nodes = [
        DocumentOrm(
            id=UUID(int=index + 1),
            owner_id=owner_id,
            parent_node_id=parent.id if node_type == DocumentNodeType.HEADING else None,
            node_type=node_type,
            title=f"Chapter {index}",
            created_at=created_at + timedelta(seconds=int(index > 0)),
        )
        for index in range(3)
    ]
    if node_type == DocumentNodeType.HEADING:
        session.add(parent)
    session.add_all(reversed(nodes))
    await session.flush()
    repository = SqlDocumentRepository(session)

    documents = (
        await repository.get_tocs(owner_id)
        if node_type == DocumentNodeType.TOC
        else await repository.get_headings(owner_id, parent.id)
    )

    assert [document.id for document in documents] == [node.id for node in nodes]


@pytest.mark.asyncio
async def test_get_text_returns_none_for_missing_content(session):
    assert await SqlDocumentRepository(session).get_text(uuid4(), uuid4()) is None


@pytest.mark.asyncio
async def test_saved_repeated_heading_remains_readable(session):
    owner_id = uuid4()
    repository = SqlDocumentRepository(session)
    documents = split_markdown(
        "# Guide\n## Topic\nFirst fragment\n## Other\nOther fragment\n## Topic\nSecond fragment",
    )

    await DocumentService(repository, session).save_document(documents, "guide.md", owner_id)

    toc = (await repository.get_tocs(owner_id))[0]
    headings = await repository.get_headings(owner_id, toc.id)
    topic = next(heading for heading in headings if heading.title == "Topic")
    content = await repository.get_text(owner_id, topic.id)
    assert content is not None
    assert "First fragment" in content.content
    assert "Second fragment" in content.content
    assert content.content.index("First fragment") < content.content.index("Second fragment")


@pytest.mark.asyncio
async def test_delete_root_cascades_without_removing_other_document(session):
    owner_id = uuid4()
    root = DocumentOrm(
        id=uuid4(), owner_id=owner_id, node_type=DocumentNodeType.TOC, title="Guide",
    )
    heading = DocumentOrm(
        id=uuid4(), owner_id=owner_id, parent_node_id=root.id,
        node_type=DocumentNodeType.HEADING, title="Chapter",
    )
    content = DocumentOrm(
        id=uuid4(), owner_id=owner_id, parent_node_id=heading.id,
        node_type=DocumentNodeType.TEXT, content="Content",
    )
    other_root = DocumentOrm(
        id=uuid4(), owner_id=uuid4(), node_type=DocumentNodeType.TOC, title="Other guide",
    )
    session.add_all([root, heading, content, other_root])
    await session.flush()

    await SqlDocumentRepository(session).delete(root.id)
    await session.flush()
    remaining_ids = (await session.scalars(select(DocumentOrm.id))).all()

    assert remaining_ids == [other_root.id]
