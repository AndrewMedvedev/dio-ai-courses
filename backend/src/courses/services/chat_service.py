from uuid import UUID

from langchain_core.documents import Document
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain.entities import Document as EntityDocument
from ..domain.vo import DocumentNodeType
from ..infra.repository import SqlDocumentRepository
from ..schemas import FileForm
from ..utils.docs_processing import DocumentHierarchyPipeline


class ChatService:
    def __init__(
        self,
        document_repo: SqlDocumentRepository,
        document_pipline: DocumentHierarchyPipeline,
        session: AsyncSession,
    ) -> None:
        self.session = session
        self.document_repo = document_repo
        self.document_pipline = document_pipline

    async def save_document(
        self,
        docs: list[Document],
        file_name: str,
        user_id: UUID,
        header_order: list[str] | None = None,
    ) -> None:

        header_order = header_order or self.document_pipline.get_header_order()

        node_cache: dict[tuple[str, ...], EntityDocument] = {}

        for document in docs:
            chain = self.document_pipline.get_heading_chain(document, header_order)
            content = document.page_content.strip()

            if content and self.document_pipline.is_heading_only(content):
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
                    root = await self.document_repo.create(doc)
                    node_cache[root_path] = root
                if content:
                    doc = EntityDocument(
                        owner_id=user_id,
                        node_type=DocumentNodeType.TEXT,
                        parent_node_id=root.id,
                        content=document.page_content,
                    )
                    await self.document_repo.create(doc)

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
                    node = await self.document_repo.create(doc)

                    node_cache[path] = node
                parent = node

            if content:
                doc = EntityDocument(
                    owner_id=user_id,
                    node_type=DocumentNodeType.TEXT,
                    parent_node_id=parent.id if parent is not None else None,
                    content=document.page_content,
                )
                node = await self.document_repo.create(doc)

        await self.session.commit()

    async def chat_with_interviewer(
        self,
        user_id: UUID,
        user_prompt: str,
        course_id: UUID,
        file_form: FileForm,
    ):
        if file_form.file is not None:
            docs = await self.document_pipline(
                file=file_form.file, file_extension=file_form.file_path.suffix
            )
            await self.save_document(
                docs=docs, file_name=file_form.file_path.stem, user_id=user_id
            )
