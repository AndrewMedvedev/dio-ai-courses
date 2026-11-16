# pyright: reportArgumentType=false

from __future__ import annotations

from typing import Annotated, Any

from dataclasses import asdict
from datetime import timedelta
from uuid import UUID

from ddf.ratelimit import SlidingWindowPolicy
from ddf.ratelimit.fastapi import rate_limit
from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from pydantic import TypeAdapter

from src.courses.ai.schemas.practicies import (
    AnyKnowledgeTest,
    PracticeResult,
)
from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.agents import (
    PracticeAgentDep,
    TesterAgentDep,
)
from src.courses.api.dependencies.repos import get_module_repo
from src.courses.api.dependencies.services import get_identity_id
from src.courses.domain.catalog.vo import (
    FileUploadAssignment,
)
from src.courses.domain.permissions.courses import READ
from src.courses.infra.docs_processing import (
    read_upload_with_limit,
)
from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity

router = APIRouter(
    tags=["Assignments"],
    dependencies=[
        Depends(
            rate_limit(
                "assignments:ai",
                SlidingWindowPolicy(
                    limit=10,
                    window=timedelta(minutes=10),
                ),
                identity=get_identity_id,
            )
        )
    ],
)


@router.post(
    "/tests/{uid}/{lesson_id}",
    summary="Сгенерировать тест для урока",
    description="Генерирует тест по указанному уроку с учётом контекста модуля и текущего пользователя.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(READ, get_module_repo))],
)
async def create_test(
    uid: UUID,
    lesson_id: UUID,
    agent: TesterAgentDep,
    identity: CurrentIdentity,
) -> dict[str, Any]:
    return await agent.call_agent_creator(
        user_id=identity.id,
        module_id=uid,
        lesson_id=lesson_id,
    )


@router.post(
    "/check/tests/{practice_id}",
    summary="Проверить ответы на тест",
    description="Проверяет ответы пользователя на сгенерированный тест и возвращает результат проверки.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(READ.code))],
)
async def check_test(
    practice: AnyKnowledgeTest,
    answers: dict[str, str],
    practice_id: UUID,
    agent: TesterAgentDep,
    _identity: CurrentIdentity,
) -> PracticeResult:
    return await agent.call_agent_checker(
        practice=practice.model_dump(),
        answers=answers,
        practice_id=practice_id,
    )


@router.post(
    "/practices/{uid}/{lesson_id}",
    summary="Сгенерировать практическое задание",
    description="Генерирует практическое задание по указанному уроку с учётом контекста модуля.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(READ, get_module_repo))],
)
async def create_practice(
    uid: UUID,
    lesson_id: UUID,
    agent: PracticeAgentDep,
    identity: CurrentIdentity,
) -> dict[str, Any]:
    return await agent.call_agent_creator(
        user_id=identity.id,
        module_id=uid,
        lesson_id=lesson_id,
    )


@router.post(
    "/check/practices/{practice_id}",
    summary="Проверить практическое задание",
    description="Принимает файл с выполненным заданием, проверяет его и возвращает результат.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(READ.code))],
)
async def check_practice(
    practice_id: UUID,
    agent: PracticeAgentDep,
    _identity: CurrentIdentity,
    file: Annotated[UploadFile, File()],
    practice: Annotated[str, Form()],
) -> PracticeResult:
    practice_obj = TypeAdapter(FileUploadAssignment).validate_json(practice)
    content = await read_upload_with_limit(file)
    return await agent.call_agent_checker(
        file=content,
        practice=asdict(practice_obj),
        practice_id=practice_id,
    )
