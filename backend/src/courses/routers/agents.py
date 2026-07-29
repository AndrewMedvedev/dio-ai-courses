from __future__ import annotations

from fastapi import APIRouter

from ...iam.dependencies import CurrentUserDep
from ...shared.dependencies import SessionDep
from ..agents.interviewer import interviewer
from ..agents.schemas import GenerationContext
from ..dependencies import ChatRepoDep
from ..schemas import Chat

agent_router = APIRouter(prefix="/agent", tags=["Agents"])


@agent_router.post("/interviewer")
async def chat_with_interviewer(
    request: Chat,
    repo: ChatRepoDep,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    result = await interviewer(
        schema=GenerationContext(
            course_id=request.course_id,
            user_id=current_user.user_id,
            prompt=request.content,
            access_token=current_user.access_token,
        ),
        db_session=session,
        repo=repo,
    )
    if "task_id" in result:
        return Chat(course_id=request.course_id, role="assistant", content="")
    return Chat(course_id=request.course_id, role="assistant", content=result)  # pyright: ignore[reportArgumentType]
