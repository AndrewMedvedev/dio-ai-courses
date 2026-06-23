from uuid import UUID

from langchain_core.documents import Document
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain.services import create_document
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

    async def save_document(self, docs: list[Document], file_name: str, user_id: UUID) -> None:
        table_of_contents = await self.document_repo.create(
            create_document(owner_id=user_id, node_type=DocumentNodeType.TOC, title=file_name)
        )
        for document in docs:
            title = await self.document_repo.create(
                create_document(
                    owner_id=user_id,
                    node_type=DocumentNodeType.HEADING,
                    parent_node_id=table_of_contents.id,
                    title=" ".join(str(v) for v in document.metadata.values()),
                )
            )
            await self.document_repo.create(
                create_document(
                    owner_id=user_id,
                    node_type=DocumentNodeType.TEXT,
                    parent_node_id=title.id,
                    content=document.page_content,
                )
            )
        await self.session.commit()

    async def chat_with_interviewer(
        self,
        user_id: UUID,
        user_prompt: str,
        course_id: UUID,
        file_form: FileForm,
    ):
        if file_form.file is not None:
            docs = self.document_pipline(
                file=file_form.file, file_extension=file_form.file_path.suffix
            )
            await self.save_document(docs, file_name=file_form.file_path.stem, user_id=user_id)
