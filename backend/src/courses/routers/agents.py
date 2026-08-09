# pyright: reportArgumentType=false

from __future__ import annotations

import json
from dataclasses import asdict

from fastapi import APIRouter

from ...iam.dependencies import CurrentUserDep
from ...shared.dependencies import SessionDep
from ..agents.external_agents import interviewer, mentor, theorist
from ..agents.schemas import Context
from ..dependencies import ChatRepoDep
from ..schemas import Chat, EditorChat

agent_router = APIRouter(prefix="/agent", tags=["Agents"])


@agent_router.post("/interviewer")
async def chat_with_interviewer(
    request: Chat,
    repo: ChatRepoDep,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Chat:
    result = await interviewer(
        chat_id=request.chat_id,
        context=Context(
            course_id=request.course_id,
            user_id=current_user.user_id,
            prompt=request.content,
            access_token=current_user.access_token,
        ),
        db_session=session,
        repo=repo,
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


@agent_router.post("/editor")
async def chat_with_editor(
    request: EditorChat,
    repo: ChatRepoDep,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Chat:
    result = await theorist(
        context=Context(
            course_id=request.course_id,
            user_id=current_user.user_id,
            prompt=request.content,
            access_token=current_user.access_token,
        ),
        chat=request,
        db_session=session,
        repo=repo,
    )
    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=json.dumps(asdict(result), ensure_ascii=False, default=str),
    )


@agent_router.post("/mentor")
async def chat_with_mentor(
    request: Chat,
    repo: ChatRepoDep,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Chat:
    result = await mentor(
        chat_id=request.chat_id,
        context=Context(
            course_id=request.course_id,
            user_id=current_user.user_id,
            prompt=request.content,
            access_token=current_user.access_token,
        ),
        db_session=session,
        repo=repo,
    )
    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=result,
    )
