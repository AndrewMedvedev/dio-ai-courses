from typing import Annotated

from asyncio import CancelledError
from collections.abc import Awaitable, Callable
from uuid import UUID

from fastapi import Depends
from pydantic import TypeAdapter

from src.courses.api.dependencies.repos import (
    AssignmentRepoDep,
    AssignmentVersionRepoDep,
    CourseRepoDep,
    LessonRepoDep,
    MemberRepoDep,
    ModuleRepoDep,
)
from src.courses.application.assessment.dtos import (
    AssignmentResponse,
    CreateAssignmentDTO,
    UpdateAssignmentDTO,
)
from src.courses.application.assessment.dtos.assignment import PracticeContentDTO
from src.courses.application.catalog.policies import ManageCourseOptions
from src.courses.domain.assessment.entities import Assignment, AssignmentVersion
from src.courses.domain.assessment.enums import AssignmentSource, AssignmentStatus, AssignmentType
from src.courses.domain.assessment.vo import AssignmentContent, AssignmentRules
from src.courses.domain.permissions.courses import UPDATE
from src.iam.application.dtos import Identity
from src.iam.application.policies import authorize
from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.application.crud import Crud
from src.shared.application.crud.types import (
    CreateHandler,
    DeleteHandler,
    UpdateHandler,
)
from src.shared.dependencies import DBSession, TransactionDep
from src.shared.domain.exceptions import InvalidStateError, NotFoundError, UnauthorizedError

AssignmentCrud = Crud[
    Assignment,
    AssignmentResponse,
    CreateAssignmentDTO,
    UpdateAssignmentDTO,
    Identity,
    Identity,
    Identity,
    Identity,
]


def map_to_response(assignment: Assignment) -> AssignmentResponse:
    return AssignmentResponse.model_validate(assignment)


type AssignmentAccessChecker = Callable[[str, UUID, Identity | None], Awaitable[None]]


def make_access_checker(
    course_repo: CourseRepoDep,
    module_repo: ModuleRepoDep,
    lesson_repo: LessonRepoDep,
    member_repo: MemberRepoDep,
) -> AssignmentAccessChecker:
    async def check_access(unit_type: str, unit_id: UUID, identity: Identity | None) -> None:
        if identity is None:
            raise UnauthorizedError
        unit_repo = {"course": course_repo, "module": module_repo, "lesson": lesson_repo}.get(
            unit_type
        )
        if unit_repo is None:
            raise InvalidStateError("Неизвестный тип объекта задания.")
        ownership = await unit_repo.read_course_ownership(unit_id)
        if ownership is None:
            raise NotFoundError("Объект для задания не найден.")
        course_id, _ = ownership
        course = await course_repo.read(course_id)
        if course is None:
            raise NotFoundError("Курс не найден.")
        if course.organization_id != identity.organization_id:
            raise PermissionDeniedError("Курс принадлежит другой организации.")
        role = await member_repo.read_role(identity.id, course_id)
        authorize(
            identity, UPDATE, ManageCourseOptions(creator_id=course.creator_id, member_role=role)
        )

    return check_access


async def load_version(
    assignment: Assignment, version_repo: AssignmentVersionRepoDep
) -> AssignmentVersion:
    if assignment.current_version_id is None:
        raise InvalidStateError("У задания нет текущей версии.")
    version = await version_repo.read(assignment.current_version_id)
    if version is None or version.is_deleted or version.assignment_id != assignment.id:
        raise InvalidStateError("Текущая версия задания недоступна.")
    assignment.current_version = version
    return version


def make_update_handler(
    version_repo: AssignmentVersionRepoDep, session: DBSession
) -> UpdateHandler[Assignment, UpdateAssignmentDTO, Identity]:
    async def update_handler(
        assignment: Assignment, dto: UpdateAssignmentDTO, _identity: Identity | None = None
    ) -> Assignment:
        if assignment.status is AssignmentStatus.ARCHIVED:
            raise InvalidStateError("Архивное задание нельзя изменить.")
        previous = await load_version(assignment, version_repo)
        if dto.content is not None:
            content_type = (
                AssignmentType.PRACTICE
                if isinstance(dto.content, PracticeContentDTO)
                else AssignmentType.TEST
            )
            if content_type is not assignment.type:
                raise InvalidStateError("Тип содержимого задания нельзя изменить.")
        version = AssignmentVersion(
            assignment_id=assignment.id,
            version=previous.version + 1,
            title=dto.title if dto.title is not None else previous.title,
            description=dto.description if dto.description is not None else previous.description,
            content=(
                TypeAdapter(AssignmentContent).validate_python(dto.content.model_dump())
                if dto.content is not None
                else previous.content
            ),
            rules=(
                TypeAdapter(AssignmentRules).validate_python(dto.rules.model_dump())
                if dto.rules is not None
                else previous.rules
            ),
        )
        await version_repo.create(version)
        await session.flush()
        assignment.set_current_version(version)
        return assignment

    return update_handler


async def lock_assignment(
    assignment: Assignment,
    identity: Identity | None,
    repo: AssignmentRepoDep,
    check_access: AssignmentAccessChecker,
) -> Assignment:
    if assignment.is_deleted:
        raise NotFoundError("Задание не найдено.")
    await check_access(assignment.unit_type, assignment.unit_id, identity)
    locked = await repo.read_for_update(assignment.id)
    if locked is None:
        raise NotFoundError("Задание не найдено.")
    return locked


async def delete_handler(assignment: Assignment, _identity: Identity | None = None) -> Assignment:
    assignment.archive()
    return assignment


def get_assignment_crud(
    repo: AssignmentRepoDep,
    version_repo: AssignmentVersionRepoDep,
    course_repo: CourseRepoDep,
    module_repo: ModuleRepoDep,
    lesson_repo: LessonRepoDep,
    member_repo: MemberRepoDep,
    session: DBSession,
    transaction: TransactionDep,
) -> AssignmentCrud:
    check_access = make_access_checker(course_repo, module_repo, lesson_repo, member_repo)

    async def create_handler(
        dto: CreateAssignmentDTO, identity: Identity | None = None
    ) -> Assignment:
        await check_access(dto.unit_type, dto.unit_id, identity)
        return Assignment(
            type=dto.type,
            source=AssignmentSource.TEACHER,
            status=AssignmentStatus.DRAFT,
            unit_type=dto.unit_type,
            unit_id=dto.unit_id,
        )

    async def create_wrapper(
        _base_create: CreateHandler[Assignment, CreateAssignmentDTO, Identity],
        dto: CreateAssignmentDTO,
        identity: Identity | None = None,
    ) -> Assignment:
        # Стандартный create коммитит раньше записи версии; здесь нужна одна транзакция.
        assignment = await create_handler(dto, identity)
        version = AssignmentVersion(
            assignment_id=assignment.id,
            version=1,
            title=dto.title,
            description=dto.description,
            content=TypeAdapter(AssignmentContent).validate_python(dto.content.model_dump()),
            rules=TypeAdapter(AssignmentRules).validate_python(dto.rules.model_dump()),
        )
        try:
            await repo.create(assignment)
            await session.flush()
            await version_repo.create(version)
            await session.flush()
            assignment.set_current_version(version)
            await repo.update(assignment)
            await transaction(assignment, version)
        except Exception, CancelledError:
            await session.rollback()
            raise
        return assignment

    async def read_wrapper(
        base_read: Callable[[Assignment, Identity | None], Awaitable[Assignment]],
        assignment: Assignment,
        identity: Identity | None = None,
    ) -> Assignment:
        if assignment.is_deleted:
            raise NotFoundError("Задание не найдено.")
        await check_access(assignment.unit_type, assignment.unit_id, identity)
        await load_version(assignment, version_repo)
        return await base_read(assignment, identity)

    async def update_wrapper(
        base_update: UpdateHandler[Assignment, UpdateAssignmentDTO, Identity],
        assignment: Assignment,
        dto: UpdateAssignmentDTO,
        identity: Identity | None = None,
    ) -> Assignment:
        try:
            locked = await lock_assignment(assignment, identity, repo, check_access)
            return await base_update(locked, dto, identity)
        except Exception, CancelledError:
            await session.rollback()
            raise

    async def delete_wrapper(
        base_delete: DeleteHandler[Assignment, Identity],
        assignment: Assignment,
        identity: Identity | None = None,
    ) -> Assignment:
        try:
            locked = await lock_assignment(assignment, identity, repo, check_access)
            return await base_delete(locked, identity)
        except Exception, CancelledError:
            await session.rollback()
            raise

    return AssignmentCrud(
        repository=repo,  # pyright: ignore[reportArgumentType]
        transaction=transaction,
        to_response=map_to_response,
        create_handler=create_handler,
        create_wrapper=create_wrapper,
        read_wrapper=read_wrapper,
        update_handler=make_update_handler(version_repo, session),
        update_wrapper=update_wrapper,
        delete_handler=delete_handler,
        delete_wrapper=delete_wrapper,
    )


AssignmentCrudDep = Annotated[AssignmentCrud, Depends(get_assignment_crud)]
