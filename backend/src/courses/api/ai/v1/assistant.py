# pyright: reportArgumentType=false

from __future__ import annotations

from dataclasses import asdict
from uuid import UUID

from ddf.ratelimit import TokenBucketPolicy
from ddf.ratelimit.fastapi import rate_limit
from fastapi import APIRouter, Depends, status

from src.courses.ai.schemas.contexts import (
    Context,
)
from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.agents import (
    EditorAgentDep,
    MentorAgentDep,
)
from src.courses.api.dependencies.repos import get_course_repo
from src.courses.api.dependencies.services import get_identity_id
from src.courses.application.conversations.dtos import (
    ChatDTO,
    EditorChatDTO,
    MentorChatDTO,
)
from src.courses.domain.permissions.courses import READ, UPDATE
from src.iam.dependencies.identity import CurrentIdentity

router = APIRouter(
    tags=["Assistants"],
)


@router.post(
    "/editor/{uid}",
    summary="Написать AI-редактору",
    description="Передаёт сообщение AI-редактору для редактирования материалов курса.",
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            rate_limit(
                "assistants:ai:editor",
                TokenBucketPolicy(capacity=5, refill_rate=1),
                identity=get_identity_id,
            )
        ),
        Depends(course_access(UPDATE, get_course_repo)),
    ],
)
async def chat_with_editor(
    uid: UUID,
    request: EditorChatDTO,
    agent: EditorAgentDep,
    identity: CurrentIdentity,
) -> ChatDTO:
    result = await agent.call_agent(
        context=Context(
            course_id=uid,
            organization_id=identity.organization_id,
            user_id=identity.id,
            prompt=request.content,
        ),
        chat=request,
    )

    return ChatDTO(
        chat_id=request.chat_id,
        role="assistant",
        content=asdict(result),
    )


@router.post(
    "/mentor/{uid}",
    summary="Написать AI-наставнику",
    description="Передаёт сообщение AI-наставнику и возвращает его ответ по материалам курса.",
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            rate_limit(
                "assistants:ai:mentor",
                TokenBucketPolicy(capacity=5, refill_rate=0.2),
                identity=get_identity_id,
            )
        ),
        Depends(course_access(READ, get_course_repo)),
    ],
)
async def chat_with_mentor(
    uid: UUID,
    request: MentorChatDTO,
    agent: MentorAgentDep,
    identity: CurrentIdentity,
) -> ChatDTO:
    result = await agent.call_agent(
        chat=request,
        context=Context(
            course_id=uid,
            organization_id=identity.organization_id,
            user_id=identity.id,
            prompt=request.content,
        ),
    )
    return ChatDTO(
        chat_id=request.chat_id,
        role="assistant",
        content=result,
    )
