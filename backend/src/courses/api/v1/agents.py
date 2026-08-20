# pyright: reportArgumentType=false

from __future__ import annotations

import json
from dataclasses import asdict

from fastapi import APIRouter

from src.iam.dependencies.identity import CurrentIdentity

from ...agents.schemas import Context
from ...application.dtos import Chat, EditorChat
from ...dependencies.agents import EditorAgentDep, InterviewerAgentDep, MentorAgentDep

router = APIRouter(prefix="/agent", tags=["Agents"])


@router.post("/interviewer")
async def chat_with_interviewer(
    request: Chat,
    service: InterviewerAgentDep,
    current_identity: CurrentIdentity,
) -> Chat:
    """Обрабатывает HTTP-запрос `chat_with_interviewer` и связывает API с сервисным слоем."""
    result = await service.call_agent(
        chat_id=request.chat_id,
        context=Context(
            course_id=request.course_id,
            user_id=current_identity.id,
            prompt=request.content,
        ),
    )

    if "task_id" in result:
        return Chat(
            chat_id=request.chat_id,
            course_id=request.course_id,
            role="assistant",
            content="",
        )
    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=result,
    )


@router.post("/editor")
async def chat_with_editor(
    request: EditorChat,
    service: EditorAgentDep,
    current_identity: CurrentIdentity,
) -> Chat:
    """Обрабатывает HTTP-запрос `chat_with_editor` и связывает API с сервисным слоем."""
    result = await service.call_agent(
        context=Context(
            course_id=request.course_id,
            user_id=current_identity.id,
            prompt=request.content,
        ),
        chat=request,
    )

    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=json.dumps(asdict(result), ensure_ascii=False, default=str),
    )


@router.post("/mentor")
async def chat_with_mentor(
    request: Chat,
    service: MentorAgentDep,
    current_identity: CurrentIdentity,
) -> Chat:
    """Обрабатывает HTTP-запрос `chat_with_mentor` и связывает API с сервисным слоем."""
    result = await service.call_agent(
        chat_id=request.chat_id,
        context=Context(
            course_id=request.course_id,
            user_id=current_identity.id,
            prompt=request.content,
        ),
    )
    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=result,
    )
