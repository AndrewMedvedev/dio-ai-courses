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

    async def save_document(
        self,
        docs: list[Document],
        file_name: str,
        user_id: UUID,
        header_order: list[str] | None = None,
    ) -> None:
        if header_order is None:
            header_order = ["H1", "H2", "H3", "H4"]

        # Кэш уже созданных узлов по цепочке заголовков:
        # ("ВВЕДЕНИЕ",) -> id узла TOC
        # ("3. ...", "Лаб 1...") -> id узла HEADING
        node_cache: dict[tuple[str, ...], UUID] = {}

        for document in docs:
            # цепочка непустых заголовков для этого чанка, например
            # ["3. ПРОЕКТИРОВАНИЕ...", "Лабораторная работа 1..."]
            chain: list[str] = []
            for key in header_order:
                value = document.metadata.get(key)
                if value and value.strip():
                    chain.append(value.strip())

            if not chain:
                # на случай контента без заголовков вообще (например, оглавление в начале файла)
                # создаём TOC-узел с именем файла и вешаем текст туда
                root_path = (file_name,)
                if root_path not in node_cache:
                    root_node = await self.document_repo.create(
                        create_document(
                            owner_id=user_id,
                            node_type=DocumentNodeType.TOC,
                            parent_node_id=None,
                            title=file_name,
                        )
                    )
                    node_cache[root_path] = root_node.id

                if document.page_content.strip():
                    await self.document_repo.create(
                        create_document(
                            owner_id=user_id,
                            node_type=DocumentNodeType.TEXT,
                            parent_node_id=node_cache[root_path],
                            content=document.page_content,
                        )
                    )
                continue

            # идём по цепочке заголовков, создавая/переиспользуя узлы
            parent_id: UUID | None = None
            path: tuple[str, ...] = ()

            for level, title in enumerate(chain):
                path = (*path, title)

                if path not in node_cache:
                    node_type = DocumentNodeType.TOC if level == 0 else DocumentNodeType.HEADING

                    node = await self.document_repo.create(
                        create_document(
                            owner_id=user_id,
                            node_type=node_type,
                            parent_node_id=parent_id,
                            title=title,
                        )
                    )
                    node_cache[path] = node.id

                parent_id = node_cache[path]

            # текст вешаем на самый глубокий заголовок цепочки (последний parent_id)
            if document.page_content.strip():
                await self.document_repo.create(
                    create_document(
                        owner_id=user_id,
                        node_type=DocumentNodeType.TEXT,
                        parent_node_id=parent_id,
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
