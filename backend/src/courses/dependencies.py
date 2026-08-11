from typing import Annotated

from fastapi import Depends

from ..shared.dependencies import SessionDep
from .infra.repository import SqlChatRepository, SqlDocumentRepository
from .services.document_service import DocumentService


def get_chat_repo(session: SessionDep) -> SqlChatRepository:
    return SqlChatRepository(session)


ChatRepoDep = Annotated[SqlChatRepository, Depends(get_chat_repo)]


def get_document_repo(session: SessionDep) -> SqlDocumentRepository:
    return SqlDocumentRepository(session)


DocumentRepoDep = Annotated[SqlDocumentRepository, Depends(get_document_repo)]


def get_document_service(session: SessionDep, repo: DocumentRepoDep) -> DocumentService:
    return DocumentService(repo=repo, session=session)


DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]
