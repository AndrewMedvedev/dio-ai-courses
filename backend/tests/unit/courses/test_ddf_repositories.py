from typing import cast

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from ddf.application.dtos import OffsetPagination, Sort
from ddf.application.exceptions import NotFoundError
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.agents.course_generator.subagents.course_builder import (
    CourseAgent,
    CourseAgentState,
)
from src.courses.agents.external_agents import practicer, tester
from src.courses.agents.middlewares.chat_checkpointer import ChatCheckpointerMiddleware
from src.courses.api.v1.theory_session import update as update_theory_session
from src.courses.application.dtos import (
    EditCourseSchema,
    EditLessonSchema,
    EditModuleSchema,
    LessonTheorySessionEditSchema,
    LessonTheorySessionFilters,
)
from src.courses.application.repos import (
    ChatRepository,
    CourseProgressRepository,
    CourseRepository,
    LessonProgressRepository,
    LessonRepository,
    ModuleRepository,
    PracticeRepository,
)
from src.courses.application.services.course import CourseService
from src.courses.application.services.lesson import LessonService
from src.courses.application.services.module import ModuleService
from src.courses.application.services.progress import LearningProgressService
from src.courses.domain.entities import (
    Chat,
    Course,
    CourseProgress,
    Lesson,
    LessonProgress,
    LessonTheorySession,
    Module,
    Practice,
)
from src.courses.domain.enums import CourseStatus, DifficultyLevel, PracticeStatus
from src.courses.infra.database.repos import course as course_module
from src.courses.infra.database.repos.chat import SqlChatRepository
from src.courses.infra.database.repos.course import SqlCourseRepository
from src.courses.infra.database.repos.document import SqlDocumentRepository
from src.courses.infra.database.repos.invitation import SqlInvitationRepository
from src.courses.infra.database.repos.lesson import SqlLessonRepository
from src.courses.infra.database.repos.member import SqlMemberRepository
from src.courses.infra.database.repos.module import SqlModuleRepository
from src.courses.infra.database.repos.practice import SqlPracticeRepository
from src.courses.infra.database.repos.theory_session import SqlLessonTheorySessionRepository
from src.iam.application.dtos import Identity, IdentityType
from src.llm_service import LLMServiceProtocol, LLMTextResponse

EXPECTED_LESSON_WRITES = 2


@pytest.mark.parametrize(
    "repository_type",
    [
        SqlChatRepository, SqlCourseRepository, SqlDocumentRepository, SqlInvitationRepository,
        SqlLessonRepository, SqlMemberRepository, SqlModuleRepository, SqlPracticeRepository,
        SqlLessonTheorySessionRepository,
    ],
)
def test_course_repositories_use_ddf_writes(repository_type):
    assert issubclass(repository_type, SqlAlchemyRepository)
    assert repository_type.create is SqlAlchemyRepository.create
    assert repository_type.update is SqlAlchemyRepository.update
    assert repository_type(Mock()).data_mapper is not None
    assert "model_mapper" not in repository_type.__dict__


@pytest.fixture
def course():
    return Course(
        title="Original", description="Keep description", difficulty=DifficultyLevel.BEGINNER,
        tags=["keep"], creator_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_course_edit_updates_entity_with_ddf_contract(course):
    repo = SimpleNamespace(read=AsyncMock(return_value=course), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())
    service = CourseService(cast(CourseRepository, repo), cast(AsyncSession, session))
    result = await service.edit(course.id, EditCourseSchema(title="Edited"))

    assert result is course
    assert course.title == "Edited"
    assert course.description == "Keep description"
    assert course.tags == ["keep"]
    repo.read.assert_awaited_once_with(course.id)
    repo.update.assert_awaited_once_with(course)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_course_status_updates_existing_entity(course):
    repo = SimpleNamespace(read=AsyncMock(return_value=course), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())

    service = CourseService(cast(CourseRepository, repo), cast(AsyncSession, session))
    await service.change_status(course.id, CourseStatus.PUBLISHED)

    assert course.status is CourseStatus.PUBLISHED
    repo.update.assert_awaited_once_with(course)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_course_edit_missing_does_not_write():
    uid = uuid4()
    repo = SimpleNamespace(read=AsyncMock(return_value=None), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())
    service = CourseService(cast(CourseRepository, repo), cast(AsyncSession, session))

    with pytest.raises(NotFoundError, match=f"Course with id {uid} not found"):
        await service.edit(uid, EditCourseSchema(title="Edited"))

    repo.update.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_module_edit_updates_entity():
    module = Module(course_id=uuid4(), title="Original", description="Keep", order=1)
    repo = SimpleNamespace(read=AsyncMock(return_value=module), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())

    service = ModuleService(cast(ModuleRepository, repo), Mock(), cast(AsyncSession, session))
    result = await service.edit(
        module.id, EditModuleSchema(title="Edited"),
    )

    assert result is module
    assert module.title == "Edited"
    assert module.description == "Keep"
    repo.update.assert_awaited_once_with(module)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_lesson_edit_and_content_blocks_update_entity():
    lesson = Lesson(module_id=uuid4(), title="Original", description="Keep", order=1)
    repo = SimpleNamespace(read=AsyncMock(return_value=lesson), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())
    service = LessonService(cast(LessonRepository, repo), Mock(), cast(AsyncSession, session))

    result = await service.edit(lesson.id, EditLessonSchema(title="Edited"))
    assert result is lesson
    assert lesson.title == "Edited"
    assert lesson.description == "Keep"
    repo.update.assert_awaited_once_with(lesson)

    repo.update.reset_mock()
    result = await service.update_content_blocks(lesson.id, [])
    assert result is lesson
    repo.update.assert_awaited_once_with(lesson)
    assert session.commit.await_count == EXPECTED_LESSON_WRITES


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["find_published", "find_user_courses", "find_member_courses"])
async def test_course_lists_use_ddf_page_and_keep_scope(monkeypatch, method):
    page = object()
    paginate = AsyncMock(return_value=page)
    monkeypatch.setattr(course_module, "paginate", paginate)
    repo = SqlCourseRepository(Mock())
    pagination = OffsetPagination(page=2, size=5)
    user_id = uuid4()
    args = (pagination,) if method == "find_published" else (user_id, pagination)

    result = await getattr(repo, method)(*args)

    assert result is page
    assert paginate.await_args is not None
    kwargs = paginate.await_args.kwargs
    assert kwargs["pagination"] is pagination
    assert kwargs["from_model"] is repo.data_mapper.from_model
    assert kwargs["sort"] == Sort(field="created_at", direction="desc")
    compiled = kwargs["stmt"].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    if method == "find_published":
        assert "courses.status =" in sql
        assert CourseStatus.PUBLISHED in compiled.params.values()
    elif method == "find_user_courses":
        assert "courses.creator_id =" in sql
        assert user_id in compiled.params.values()
    else:
        assert "JOIN members" in sql
        assert "members.user_id =" in sql
        assert user_id in compiled.params.values()
        assert "courses.status NOT IN" in sql
        statuses = next(value for value in compiled.params.values() if isinstance(value, list))
        assert statuses == [CourseStatus.ARCHIVED, CourseStatus.DRAFT]
        bind = repo.model.__table__.c.status.type.bind_processor(postgresql.dialect())
        assert bind is not None
        assert [bind(status) for status in statuses] == ["ARCHIVED", "DRAFT"]


@pytest.mark.asyncio
async def test_chat_update_keeps_user_course_scope_and_uses_ddf_update():
    chat = Chat(user_id=uuid4(), course_id=uuid4(), messages=[])
    repo = SimpleNamespace(read_by_keys=AsyncMock(return_value=chat), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())
    service = SimpleNamespace(runtime=SimpleNamespace(
        state=SimpleNamespace(chat_id=chat.id),
        context=SimpleNamespace(user_id=chat.user_id, course_id=chat.course_id),
    ))
    response = LLMTextResponse(output=None, raw_text=None, total_tokens=0, messages=[
        {"role": "assistant", "content": "Answer"},
        {"role": "tool", "content": "Internal"},
    ])

    middleware = ChatCheckpointerMiddleware(
        cast(ChatRepository, repo), cast(AsyncSession, session),
    )
    result = await middleware.after_agent(cast(LLMServiceProtocol, service), response)

    assert result is response
    repo.read_by_keys.assert_awaited_once_with(
        chat_id=chat.id, user_id=chat.user_id, course_id=chat.course_id,
    )
    assert chat.messages == response.messages
    repo.update.assert_awaited_once_with(chat)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(("repository_type", "keys"), [
    (SqlChatRepository, ("user_id", "course_id", "chat_id")),
    (SqlPracticeRepository, ("user_id", "module_id", "lesson_id")),
    (SqlMemberRepository, ("user_id", "course_id")),
])
async def test_scoped_reads_keep_all_key_predicates(repository_type, keys):
    result = Mock()
    result.scalar_one_or_none.return_value = None
    session = SimpleNamespace(execute=AsyncMock(return_value=result))
    repo = repository_type(session)
    identifiers = {key: uuid4() for key in keys}

    assert await repo.read_by_keys(**identifiers) is None

    stmt = session.execute.await_args.args[0]
    compiled = stmt.compile(dialect=postgresql.dialect())
    assert set(identifiers.values()) == set(compiled.params.values())
    assert len(stmt._where_criteria) == len(keys)


@pytest.mark.asyncio
async def test_theory_session_update_uses_entity():
    theory = LessonTheorySession(lesson_id=uuid4(), user_id=uuid4())
    repo = SimpleNamespace(read=AsyncMock(return_value=theory), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())

    schema = LessonTheorySessionEditSchema(active_time_seconds=15)
    identity = Identity(id=theory.user_id, type=IdentityType.USER, organization_id=None)
    result = await update_theory_session(
        identity, cast(SqlLessonTheorySessionRepository, repo), cast(AsyncSession, session),
        theory.id, schema,
    )

    assert result is theory
    assert theory.active_time_seconds == schema.active_time_seconds
    repo.update.assert_awaited_once_with(theory)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_theory_session_filters_and_sort_preserve_sql_bounds():
    result = Mock()
    result.scalars.return_value.all.return_value = []
    session = SimpleNamespace(execute=AsyncMock(return_value=result))
    lesson_id, user_id = uuid4(), uuid4()
    start = datetime(2026, 10, 1, tzinfo=UTC)
    end = datetime(2026, 10, 2, tzinfo=UTC)
    repo = SqlLessonTheorySessionRepository(cast(AsyncSession, session))

    assert await repo.find_sessions(
        lesson_id=lesson_id, user_id=user_id,
        filters=LessonTheorySessionFilters(created_from=start, created_to=end),
        sort=Sort(field="created_at", direction="desc"),
    ) == []

    stmt = session.execute.await_args.args[0]
    compiled = stmt.compile(dialect=postgresql.dialect())
    assert set(compiled.params.values()) == {lesson_id, user_id, start, end}
    assert "created_at >=" in str(compiled)
    assert "created_at <" in str(compiled)
    assert "created_at DESC" in str(compiled)


@pytest.mark.asyncio
async def test_generator_final_status_updates_saved_course_only(course):
    repo = SimpleNamespace(read=AsyncMock(return_value=course), update=AsyncMock())
    session = SimpleNamespace(commit=AsyncMock())
    state = {"course": {"id": course.id, "title": course.title}}
    agent = CourseAgent(
        session=cast(AsyncSession, session), client=Mock(), repo=cast(CourseRepository, repo),
        module_agent=Mock(), reasoner_agent=Mock(),
    )

    await agent.update_course(cast(CourseAgentState, state))

    assert course.status is CourseStatus.DRAFT
    assert state == {"course": {"id": course.id, "title": course.title}}
    repo.update.assert_awaited_once_with(course)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("agent_module", ["practicer", "tester"])
@pytest.mark.parametrize(
    ("score", "status"), [(100, PracticeStatus.COMPLETED), (0, PracticeStatus.FAILED)],
)
async def test_practice_checkers_update_entity_without_real_llm(
    monkeypatch, agent_module, score, status,
):
    module = practicer if agent_module == "practicer" else tester
    llm = SimpleNamespace(invoke=AsyncMock(return_value=SimpleNamespace(output={"score": score})))
    monkeypatch.setattr(module, "LLMTextService", Mock(return_value=llm))
    practice = Practice(user_id=uuid4(), module_id=uuid4(), lesson_id=uuid4())
    repo = SimpleNamespace(read=AsyncMock(return_value=practice), update=AsyncMock())
    transaction = AsyncMock()
    if agent_module == "practicer":
        agent = practicer.PracticerAgent(
            cast(PracticeRepository, repo), Mock(), transaction, Mock(),
        )
        response = await agent.call_agent_checker({"question": "Example"}, b"answer", practice.id)
    else:
        tester_agent = tester.TesterAgent(
            cast(PracticeRepository, repo), Mock(), transaction, Mock(),
        )
        response = await tester_agent.call_agent_checker(
            {"question": "Example"}, {"answer": "A"}, practice.id,
        )

    assert response.score == score
    assert practice.status is status
    repo.read.assert_awaited_once_with(practice.id)
    repo.update.assert_awaited_once_with(practice)
    transaction.assert_awaited_once_with(practice)


@pytest.mark.asyncio
async def test_course_progress_returns_entity_when_ddf_update_returns_none():
    progress = CourseProgress(user_id=uuid4(), course_id=uuid4())
    completed_lessons = 2
    total_lessons = 3
    repo = SimpleNamespace(
        count_completed_lessons=AsyncMock(return_value=completed_lessons),
        update=AsyncMock(return_value=None),
    )
    session = SimpleNamespace(commit=AsyncMock())
    service = LearningProgressService(
        progress_repo=Mock(), course_progress_repo=cast(CourseProgressRepository, repo),
        module_progress_repo=Mock(), session=cast(AsyncSession, session),
    )

    result = await service.update_course_progress(progress, total_lessons)

    assert result is progress
    assert progress.progress_percent == round(completed_lessons * 100 / total_lessons, 2)
    repo.count_completed_lessons.assert_awaited_once_with(progress.id)
    repo.update.assert_awaited_once_with(progress)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_lesson_progress_returns_entity_when_ddf_update_returns_none():
    progress = LessonProgress(module_progress_id=uuid4(), lesson_id=uuid4())
    completed_at = datetime(2026, 10, 26, tzinfo=UTC)
    repo = SimpleNamespace(update=AsyncMock(return_value=None))
    session = SimpleNamespace(commit=AsyncMock())
    service = LearningProgressService(
        progress_repo=cast(LessonProgressRepository, repo), course_progress_repo=Mock(),
        module_progress_repo=Mock(), session=cast(AsyncSession, session),
    )

    result = await service.update(progress, completed_at)

    assert result is progress
    assert progress.theory_completed_at == completed_at
    assert progress.practice_completed_at is None
    assert progress.test_completed_at is None
    repo.update.assert_awaited_once_with(progress)
    session.commit.assert_awaited_once()
