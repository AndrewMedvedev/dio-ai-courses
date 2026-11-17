from uuid import UUID

from langchain_core.documents import Document
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.application.knowledge.repos import DocumentRepository
from src.courses.domain.knowledge.entities import Document as EntityDocument
from src.courses.domain.knowledge.enums import DocumentNodeType
from src.courses.infra.docs_processing import get_header_order, get_heading_chain, is_heading_only


async def create_document(
    repo: DocumentRepository,
    session: AsyncSession,
    docs: list[Document],
    file_name: str,
    user_id: UUID,
) -> None:
    node_cache: dict[tuple[str, ...], EntityDocument] = {}

    for document in docs:
        chain = get_heading_chain(document, get_header_order())
        content = document.page_content.strip()

        if content and is_heading_only(content):
            continue

        if not chain:
            root_path = (file_name,)
            root = node_cache.get(root_path)
            if root is None:
                doc = EntityDocument(
                    owner_id=user_id,
                    node_type=DocumentNodeType.TOC,
                    title=file_name,
                )
                root = await repo.create(doc)
                node_cache[root_path] = root
            if content:
                doc = EntityDocument(
                    owner_id=user_id,
                    node_type=DocumentNodeType.TEXT,
                    parent_node_id=root.id,
                    content=document.page_content,
                )
                await repo.create(doc)

            continue

        parent, path = None, ()
        for level, title in enumerate(chain):
            path = (*path, title)
            node = node_cache.get(path)
            if node is None:
                node_type = DocumentNodeType.TOC if level == 0 else DocumentNodeType.HEADING
                doc = EntityDocument(
                    owner_id=user_id,
                    node_type=node_type,
                    parent_node_id=parent.id if parent is not None else None,
                    title=title,
                )
                node = await repo.create(doc)

                node_cache[path] = node
            parent = node

        if content:
            doc = EntityDocument(
                owner_id=user_id,
                node_type=DocumentNodeType.TEXT,
                parent_node_id=parent.id if parent is not None else None,
                content=document.page_content,
            )
            node = await repo.create(doc)

    await session.commit()
