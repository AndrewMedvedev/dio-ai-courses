# pyright: reportArgumentType=false

from __future__ import annotations

from uuid import UUID

from ddf.ratelimit import TokenBucketPolicy
from ddf.ratelimit.fastapi import rate_limit
from fastapi import APIRouter, Depends, status

from src.courses.ai.schemas.contexts import (
    Context,
    GenerationContext,
)
from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.agents import (
    CourseInterviewerAgentDep,
    LessonInterviewerAgentDep,
    ModuleInterviewerAgentDep,
)
from src.courses.api.dependencies.repos import get_course_repo
from src.courses.api.dependencies.services import get_identity_id
from src.courses.application.conversations import ModuleGenerationChatDTO
from src.courses.application.conversations.dtos import (
    ChatDTO,
    LessonGenerationChatDTO,
)
from src.courses.domain.permissions.courses import CREATE, UPDATE
from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity

router = APIRouter(tags=["Interviewers"])


@router.post(
    "/courses/interviewer/{uid}",
    summary="Написать AI-интервьюеру",
    description="Передаёт сообщение AI-интервьюеру, который помогает собрать вводные данные для создания курса.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(CREATE.code))],
)
async def chat_with_course_interviewer(
    uid: UUID,
    request: ChatDTO,
    agent: CourseInterviewerAgentDep,
    identity: CurrentIdentity,
) -> ChatDTO:
    result = await agent.call_agent(
        chat_id=request.chat_id,
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


@router.post(
    "/modules/interviewer/{uid}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_course_repo))],
)
async def chat_with_module_interviewer(
    uid: UUID,
    request: ModuleGenerationChatDTO,
    agent: ModuleInterviewerAgentDep,
    identity: CurrentIdentity,
) -> ModuleGenerationChatDTO:
    result = await agent.call_agent(
        chat_id=request.chat_id,
        context=GenerationContext(
            course_id=uid,
            organization_id=identity.organization_id,
            user_id=identity.id,
            prompt=request.content,
            position=request.position,
        ),
    )

    return ModuleGenerationChatDTO(
        chat_id=request.chat_id,
        role="assistant",
        content=result,
        position=request.position,
    )


@router.post(
    "/lessons/interviewer/{uid}",
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            rate_limit(
                "lessons:ai:interviewer",
                TokenBucketPolicy(capacity=3, refill_rate=1),
                identity=get_identity_id,
            )
        ),
        Depends(course_access(UPDATE, get_course_repo)),
    ],
)
async def chat_with_lesson_interviewer(
    uid: UUID,
    request: LessonGenerationChatDTO,
    agent: LessonInterviewerAgentDep,
    identity: CurrentIdentity,
) -> LessonGenerationChatDTO:
    result = await agent.call_agent(
        chat_id=request.chat_id,
        context=GenerationContext(
            course_id=uid,
            organization_id=identity.organization_id,
            user_id=identity.id,
            prompt=request.content,
            module_id=request.module_id,
            position=request.position,
        ),
    )

    return LessonGenerationChatDTO(
        chat_id=request.chat_id,
        role="assistant",
        content=result,
        module_id=request.module_id,
        position=request.position,
    )
