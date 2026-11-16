from typing import Annotated

from fastapi import Depends
from langchain_text_splitters import RecursiveCharacterTextSplitter

from src.core.qdrant import qdrant_client
from src.courses.application.assessment.repos import PracticeRepository
from src.courses.application.catalog.repos import (
    CourseRepository,
    LessonRepository,
    ModuleRepository,
)
from src.courses.application.conversations.repos import ChatRepository
from src.courses.application.enrollment.repos import InvitationRepository, MemberRepository
from src.courses.application.generation.repos import GenerationSessionRepository
from src.courses.application.knowledge.repos import DocumentRepository
from src.courses.application.learning.repos import (
    CourseProgressRepository,
    LessonProgressRepository,
    LessonTheorySessionRepository,
    ModuleProgressRepository,
)
from src.courses.infra.database.repos.chat import SqlChatRepository
from src.courses.infra.database.repos.course import SqlCourseRepository
from src.courses.infra.database.repos.course_progress import SqlCourseProgressRepository
from src.courses.infra.database.repos.document import SqlDocumentRepository
from src.courses.infra.database.repos.generation_session import SqlGenerationSessionRepository
from src.courses.infra.database.repos.invitation import SqlInvitationRepository
from src.courses.infra.database.repos.lesson import SqlLessonRepository
from src.courses.infra.database.repos.lesson_progress import SqlLessonProgressRepository
from src.courses.infra.database.repos.member import SqlMemberRepository
from src.courses.infra.database.repos.module import SqlModuleRepository
from src.courses.infra.database.repos.module_progress import SqlModuleProgressRepository
from src.courses.infra.database.repos.practice import SqlPracticeRepository
from src.courses.infra.database.repos.theory_session import SqlLessonTheorySessionRepository
from src.courses.infra.database.repos.vector_repo import QdrantRepository
from src.shared.dependencies.database import DBSession

splitter = RecursiveCharacterTextSplitter(chunk_size=3072, chunk_overlap=150, length_function=len)


def get_lesson_repo(session: DBSession) -> LessonRepository:
    return SqlLessonRepository(session)


def get_lesson_progress_repo(session: DBSession) -> LessonProgressRepository:
    return SqlLessonProgressRepository(session)


def get_module_progress_repo(session: DBSession) -> ModuleProgressRepository:
    return SqlModuleProgressRepository(session)


def get_course_progress_repo(session: DBSession) -> CourseProgressRepository:
    return SqlCourseProgressRepository(session)


def get_module_repo(session: DBSession) -> ModuleRepository:
    return SqlModuleRepository(session)


def get_course_repo(session: DBSession) -> CourseRepository:
    return SqlCourseRepository(session)


def get_practice_repo(session: DBSession) -> PracticeRepository:
    return SqlPracticeRepository(session)


def get_chat_repo(session: DBSession) -> ChatRepository:
    return SqlChatRepository(session)


def get_document_repo(session: DBSession) -> DocumentRepository:
    return SqlDocumentRepository(session)


def get_theory_session_repo(session: DBSession) -> LessonTheorySessionRepository:
    return SqlLessonTheorySessionRepository(session)


def get_member_repo(session: DBSession) -> MemberRepository:
    return SqlMemberRepository(session)


def get_invitation_repo(session: DBSession) -> InvitationRepository:
    return SqlInvitationRepository(session)


def get_generation_session_repo(session: DBSession) -> GenerationSessionRepository:
    return SqlGenerationSessionRepository(session)


def get_vector_repo() -> QdrantRepository:
    return QdrantRepository(qdrant_client, splitter)


LessonRepoDep = Annotated[LessonRepository, Depends(get_lesson_repo)]
LessonProgressRepoDep = Annotated[LessonProgressRepository, Depends(get_lesson_progress_repo)]
ModuleProgressRepoDep = Annotated[ModuleProgressRepository, Depends(get_module_progress_repo)]
CourseProgressRepoDep = Annotated[CourseProgressRepository, Depends(get_course_progress_repo)]
ModuleRepoDep = Annotated[ModuleRepository, Depends(get_module_repo)]
CourseRepoDep = Annotated[CourseRepository, Depends(get_course_repo)]
PracticeRepoDep = Annotated[PracticeRepository, Depends(get_practice_repo)]
ChatRepoDep = Annotated[ChatRepository, Depends(get_chat_repo)]
DocumentRepoDep = Annotated[DocumentRepository, Depends(get_document_repo)]
TheorySessionRepoDep = Annotated[LessonTheorySessionRepository, Depends(get_theory_session_repo)]
MemberRepoDep = Annotated[MemberRepository, Depends(get_member_repo)]
InvitationRepoDep = Annotated[InvitationRepository, Depends(get_invitation_repo)]
GenerationSessionRepoDep = Annotated[
    GenerationSessionRepository, Depends(get_generation_session_repo)
]
VectorRepoDep = Annotated[QdrantRepository, Depends(get_vector_repo)]
