from typing import Any, Protocol

from uuid import UUID

from ddf.application.dtos import Page, Pagination
from ddf.application.repositories import Repository
from ddf.domain.models import Entity
from ddf.domain.vo.email import Email

from src.courses.domain.entities import (
    AnyContentBlock,
    Chat,
    Course,
    CourseProgress,
    Document,
    Invitation,
    Lesson,
    LessonProgress,
    Member,
    Module,
    ModuleProgress,
    Practice,
)
from src.courses.domain.events import LessonProgressUpdated
from src.courses.domain.vo import MemberRole
from src.courses.infra.services.client import SrvCourseClient
from src.iam.application.dtos import InvitationCreate as IAMInvitationCreate
from src.iam.application.dtos import UserResponse
from src.iam.domain.entities import Invitation as IAMInvitation
from src.iam.domain.entities import Membership
from src.organization.application.dtos import InvitationCreate as OrganizationInvitationCreate
from src.organization.domain.entities import Invitation as OrganizationInvitation

from .dtos import BasicInfo, CourseBasicInfo, LessonBasicInfo, ModuleBasicInfo


class BasicInfoProtocol[EntityT: Entity, BasicInfoT](Repository[EntityT]):
    async def get_by_id_basic_info(self, uid: UUID) -> BasicInfoT | None: ...

    async def read_course_ownership(
        self,
        uid: UUID,
    ) -> tuple[UUID, UUID] | None: ...


class LessonRepository(BasicInfoProtocol[Lesson, LessonBasicInfo]):
    async def create_at(self, lesson: Lesson) -> Lesson: ...

    async def delete_and_compact(self, lesson_id: UUID) -> None: ...

    async def get_content_blocks_by_id(self, lesson_id: UUID) -> list[AnyContentBlock] | None: ...

    async def replace_content_block(
        self, lesson_id: UUID, block_index: int, new_block: dict[str, Any],
    ) -> None: ...

    async def assign_module(self, lesson_id: UUID, module_id: UUID) -> None: ...


class ModuleRepository(BasicInfoProtocol[Module, ModuleBasicInfo]):
    async def create_at(self, module: Module) -> Module: ...

    async def delete_and_compact(self, module_id: UUID) -> None: ...

    async def assign_course(self, module_id: UUID, course_id: UUID) -> None: ...

    async def select_lessons_by_id_module(self, module_id: UUID) -> list[BasicInfo]: ...


class CourseRepository(BasicInfoProtocol[Course, CourseBasicInfo]):
    async def find_published(self, pagination: Pagination) -> Page[Course]: ...

    async def find_user_courses(self, user_id: UUID, pagination: Pagination) -> Page[Course]: ...

    async def find_member_courses(self, user_id: UUID, pagination: Pagination) -> Page[Course]: ...

    async def select_modules_by_id_course(self, course_id: UUID) -> list[BasicInfo]: ...

    async def find_members(
        self,
        user_id: UUID,
        pagination: Pagination,
    ) -> Page[Course]: ...


class DocumentRepository(Repository[Document]):
    async def get_tocs(self, owner_id: UUID) -> list[Document]: ...

    async def get_headings(self, toc_id: UUID) -> list[Document]: ...

    async def get_texts(self, heading_id: UUID) -> Document | None: ...


class ChatRepository(Repository[Chat]):
    async def read_by_keys(self, user_id: UUID, course_id: UUID, chat_id: UUID) -> Chat | None: ...


class PracticeRepository(Repository[Practice]):
    async def read_by_keys(
        self, user_id: UUID, module_id: UUID, lesson_id: UUID,
    ) -> Practice | None: ...

    async def read_by_module(self, user_id: UUID, module_id: UUID) -> list[dict[str, Any]]: ...


class ProgressRepository[ProgressT: Entity](Repository[ProgressT]):
    async def get_by_user(self, user_id: UUID, resource_id: UUID) -> ProgressT | None: ...

    async def exist_by_user(self, user_id: UUID, resource_id: UUID) -> bool: ...


class LessonProgressRepository(ProgressRepository[LessonProgress]):
    async def update_from_event(self, event: LessonProgressUpdated) -> None: ...


class ModuleProgressRepository(ProgressRepository[ModuleProgress]): ...


class CourseProgressRepository(ProgressRepository[CourseProgress]):
    async def count_completed_lessons(self, course_progress_id: UUID) -> int: ...

    async def find_by_course(
        self, course_id: UUID, pagination: Pagination
    ) -> Page[CourseProgress]: ...


class MemberRepository(Repository[Member]):
    async def read_by_keys(self, user_id: UUID, course_id: UUID) -> Member | None: ...

    async def exists_by_keys(self, user_id: UUID, course_id: UUID) -> bool: ...

    async def read_role(self, user_id: UUID, course_id: UUID) -> MemberRole | None: ...

    async def find_by_course(self, course_id: UUID, pagination: Pagination) -> Page[Member]: ...


class InvitationRepository(Repository[Invitation]):
    async def get_by_token(self, token: str) -> Invitation | None: ...

    async def find_by_course(
        self,
        course_id: UUID,
        pagination: Pagination,
    ) -> Page[Invitation]: ...

    async def get_active(
        self,
        email: Email,
        course_id: UUID,
    ) -> Invitation | None: ...


class VectorRepository(Protocol):
    async def create(
        self,
        text: str,
        metadata: dict[str, Any] | None = None,
        document_id: str | None = None,
    ) -> None: ...

    async def read(
        self,
        query: str,
        limit: int = 5,
        prefetch_limit: int = 25,
        metadata_filters: dict[str, Any] | None = None,
    ) -> list[str]: ...


class IAMRepository(Protocol):
    async def get_user_by_email(
        self,
        email: str,
    ) -> UserResponse | None: ...

    async def invite_user_in_system(
        self,
        dto: IAMInvitationCreate,
    ) -> IAMInvitation | None: ...

    async def get_user_membership(
        self,
        organization_id: UUID,
        user_id: UUID,
    ) -> Membership | None: ...


class OrganizationRepository(Protocol):
    async def __call__(
        self,
        client: SrvCourseClient,
        dto: OrganizationInvitationCreate,
    ) -> OrganizationInvitation | None: ...
