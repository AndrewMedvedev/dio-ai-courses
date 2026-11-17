from typing import Annotated, Any

import asyncio
import logging
from uuid import UUID

from ddf.application.exceptions import NotFoundError
from langchain_core.runnables import RunnableConfig
from sqlalchemy.ext.asyncio import AsyncSession
from taskiq import Context as TaskiqContext
from taskiq import TaskiqDepends
from taskiq_cancellation import CancellationType

from src.core.tkq import cancellation_backend, taskiq_broker
from src.courses.ai.helper import invoke_or_resume
from src.courses.ai.schemas.contexts import Context, GenerationContext
from src.courses.api.dependencies.agents import CourseAgentDep, LessonAgentDep, ModuleAgentDep
from src.courses.api.dependencies.repos import (
    GenerationSessionRepoDep,
    LessonRepoDep,
    ModuleRepoDep,
    VectorRepoDep,
)
from src.courses.application.generation.repos import GenerationSessionRepository
from src.courses.domain.catalog.ranking import rank_between
from src.courses.domain.generation.enums import GenerationStatus
from src.courses.infra.formatting import get_lesson_context
from src.shared.dependencies import DBSession

logger = logging.getLogger(__name__)

TaskiqContextDep = Annotated[
    TaskiqContext,
    TaskiqDepends(TaskiqContext),
]

RETRY_OPTS = {"retry_on_error": True, "max_retries": 5, "delay": 10, "timeout": 5 * 60 * 60}


async def generation_lifecycle(
    args: dict[str, Any],
    repo: GenerationSessionRepository,
    session: AsyncSession,
    taskiq_context: TaskiqContext,
) -> None:
    task_id = taskiq_context.message.task_id

    started = await repo.transition(
        task_id,
        from_statuses={GenerationStatus.PENDING, GenerationStatus.RUNNING},
        to_status=GenerationStatus.RUNNING,
    )
    if not started:
        current = await repo.read_with_generation_key(task_id)
        if current is None:
            raise NotFoundError
        if current.status is GenerationStatus.CANCELLING:
            await repo.transition(
                task_id,
                from_statuses={GenerationStatus.CANCELLING},
                to_status=GenerationStatus.CANCELLED,
            )
            await session.commit()
        # Терминальный статус или уже принятая отмена: граф не запускать.
        return

    await session.commit()

    try:
        await invoke_or_resume(**args)

        completed = await repo.transition(
            task_id,
            from_statuses={GenerationStatus.RUNNING},
            to_status=GenerationStatus.COMPLETED,
        )
        if not completed:
            # Если отмену приняли до записи COMPLETED, она выигрывает гонку.
            await repo.transition(
                task_id,
                from_statuses={GenerationStatus.CANCELLING},
                to_status=GenerationStatus.CANCELLED,
            )
        await session.commit()

    except asyncio.CancelledError:
        await session.rollback()
        await repo.transition(
            task_id,
            from_statuses={GenerationStatus.RUNNING, GenerationStatus.CANCELLING},
            to_status=GenerationStatus.CANCELLED,
        )
        await session.commit()
        raise

    except Exception:
        await session.rollback()
        logger.exception("generation failed: task_id=%s", task_id)

        retries_left = int(taskiq_context.message.labels.get("retries_left", "0"))
        if retries_left == 0:
            await repo.transition(
                task_id,
                from_statuses={GenerationStatus.RUNNING},
                to_status=GenerationStatus.FAILED,
            )
            await session.commit()
        raise


@taskiq_broker.task(
    task_name="courses.generate_course",
    **RETRY_OPTS,
)
@cancellation_backend.cancellable(cancellation_type=CancellationType.EDGE)
async def generate_course(
    context: Context,
    agent: CourseAgentDep,
    taskiq_context: TaskiqContextDep,
    repo: GenerationSessionRepoDep,
    session: DBSession,
) -> dict[str, UUID]:
    await generation_lifecycle(
        args={
            "graph": agent,
            "input_data": {"generation_context": context},
            "config": RunnableConfig(
                configurable={
                    "thread_id": f"course:{context.course_id}:task:{taskiq_context.message.task_id}",
                }
            ),
        },
        repo=repo,
        session=session,
        taskiq_context=taskiq_context,
    )
    return {"course_id": context.course_id}


@taskiq_broker.task(
    task_name="courses.generate_module",
    **RETRY_OPTS,
)
@cancellation_backend.cancellable(cancellation_type=CancellationType.EDGE)
async def generate_module(
    context: GenerationContext,
    audience_description: str,
    learning_objectives: list[str],
    description: str,
    agent: ModuleAgentDep,
    taskiq_context: TaskiqContextDep,
    repo: GenerationSessionRepoDep,
    module_repo: ModuleRepoDep,
    session: DBSession,
) -> dict[str, UUID | str]:
    before_rank, after_rank = await module_repo.find_rank_bounds(
        course_id=context.course_id,
        before_id=context.position.before_id,
        after_id=context.position.after_id,
    )
    rank = rank_between(
        before_rank,
        after_rank,
    )
    await generation_lifecycle(
        args={
            "graph": agent,
            "input_data": {
                "generation_context": context,
                "audience_description": audience_description,
                "learning_objectives": learning_objectives,
                "rank": rank,
                "module_description": description,
            },
            "config": RunnableConfig(
                configurable={
                    "thread_id": f"course:{context.course_id}:module:{rank}:task:{taskiq_context.message.task_id}"
                }
            ),
        },
        repo=repo,
        session=session,
        taskiq_context=taskiq_context,
    )
    return {"course_id": context.course_id, "module_rank": rank}


@taskiq_broker.task(task_name="courses.generate_lesson", **RETRY_OPTS)
@cancellation_backend.cancellable(cancellation_type=CancellationType.EDGE)
async def generate_lesson(
    context: GenerationContext,
    audience_description: str,
    learning_objectives: list[str],
    description: str,
    agent: LessonAgentDep,
    taskiq_context: TaskiqContextDep,
    repo: GenerationSessionRepoDep,
    lesson_repo: LessonRepoDep,
    session: DBSession,
) -> dict[str, UUID | str]:
    before_rank, after_rank = await lesson_repo.find_rank_bounds(
        module_id=context.module_id,  # pyright: ignore[reportArgumentType]
        before_id=context.position.before_id,
        after_id=context.position.after_id,
    )
    rank = rank_between(
        before_rank,
        after_rank,
    )
    await generation_lifecycle(
        args={
            "graph": agent,
            "input_data": {
                "generation_context": context,
                "module_id": context.module_id,
                "audience_description": audience_description,
                "learning_objectives": learning_objectives,
                "rank": rank,
                "lesson_description": description,
            },
            "config": RunnableConfig(
                configurable={
                    "thread_id": f"course:{context.course_id}:module:{context.module_id}:lesson:{rank}:task:{taskiq_context.message.task_id}"  # noqa: E501
                }
            ),
        },
        repo=repo,
        session=session,
        taskiq_context=taskiq_context,
    )

    return {
        "course_id": context.course_id,
        "module_id": context.module_id,  # pyright: ignore[reportReturnType]
        "lesson_rank": rank,
    }


@taskiq_broker.task(
    task_name="courses.index_lesson",
    retry_on_error=True,
    max_retries=2,
    delay=5,
    timeout=60,
)
async def index_lesson(
    course_id: UUID,
    lesson_id: UUID,
    lesson_repo: LessonRepoDep,
    vector_repo: VectorRepoDep,
) -> None:
    logger.info(
        "Starting lesson indexing: course_id=%s lesson_id=%s",
        course_id,
        lesson_id,
    )
    lesson = await lesson_repo.read(lesson_id)
    if lesson is None:
        logger.warning("Cannot index lesson %s: lesson not found", lesson_id)
        return
    try:
        lesson_text = get_lesson_context(lesson)
        document_id = f"lesson:{course_id}:{lesson.id}"

        await vector_repo.create(
            text=lesson_text,
            document_id=document_id,
            metadata={
                "course_id": str(course_id),
                "lesson_id": str(lesson.id),
                "document_id": document_id,
                "source": lesson.title,
                "category": "theory",
                "document_type": "lesson",
            },
        )

        logger.info(
            "Indexed lesson %s for course %s as document %s",
            lesson.id,
            course_id,
            document_id,
        )
    except Exception:
        logger.exception(
            "Lesson indexing failed: course_id=%s lesson_id=%s",
            course_id,
            lesson_id,
        )
        raise
