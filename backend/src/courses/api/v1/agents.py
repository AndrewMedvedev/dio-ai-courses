# pyright: reportArgumentType=false

from __future__ import annotations

from typing import Annotated, Any

from dataclasses import asdict
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile, status
from pydantic import TypeAdapter

from src.courses.agents.schemas import AnyKnowledgeTest, Context, GenerationContext, PracticeResult
from src.courses.application.dtos import (
    Chat,
    EditorChat,
    LessonGenerationChat,
    MentorChat,
    ModuleGenerationChat,
)
from src.courses.dependencies.agents import (
    CourseInterviewerAgentDep,
    EditorAgentDep,
    LessonInterviewerAgentDep,
    MentorAgentDep,
    ModuleInterviewerAgentDep,
    PracticeAgentDep,
    TesterAgentDep,
)
from src.courses.dependencies.services import CheckCourseAccessDep
from src.courses.domain.permissions.courses import READ, UPDATE
from src.courses.domain.vo import FileUploadAssignment
from src.courses.utils.docs_processing import read_upload_with_limit
from src.iam.dependencies.identity import CurrentIdentity

router = APIRouter(prefix="/agent", tags=["Agents"])


@router.post(
    "/course/interviewer",
    status_code=status.HTTP_200_OK,
)
async def chat_with_course_interviewer(
    request: Chat,
    agent: CourseInterviewerAgentDep,
    identity: CurrentIdentity,
) -> Chat:
    result = await agent.call_agent(
        chat_id=request.chat_id,
        context=Context(
            course_id=request.course_id,
            user_id=identity.id,
            prompt=request.content,
        ),
    )

    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=result,
    )


@router.post(
    "/module/interviewer",
    status_code=status.HTTP_200_OK,
)
async def chat_with_module_interviewer(
    request: ModuleGenerationChat,
    agent: ModuleInterviewerAgentDep,
    identity: CurrentIdentity,
) -> ModuleGenerationChat:
    result = await agent.call_agent(
        chat_id=request.chat_id,
        context=GenerationContext(
            course_id=request.course_id,
            user_id=identity.id,
            prompt=request.content,
            order=request.order,
        ),
    )

    return ModuleGenerationChat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=result,
        order=request.order,
    )


@router.post(
    "/lesson/interviewer",
    status_code=status.HTTP_200_OK,
)
async def chat_with_lesson_interviewer(
    request: LessonGenerationChat,
    agent: LessonInterviewerAgentDep,
    identity: CurrentIdentity,
) -> LessonGenerationChat:
    result = await agent.call_agent(
        chat_id=request.chat_id,
        context=GenerationContext(
            course_id=request.course_id,
            user_id=identity.id,
            prompt=request.content,
            module_id=request.module_id,
            order=request.order,
        ),
    )

    return LessonGenerationChat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=result,
        module_id=request.module_id,
        order=request.order,
    )


@router.post(
    "/editor",
    status_code=status.HTTP_200_OK,
)
async def chat_with_editor(
    request: EditorChat,
    agent: EditorAgentDep,
    identity: CurrentIdentity,
    check_access: CheckCourseAccessDep,
) -> Chat:
    await check_access(
        identity=identity,
        permission=UPDATE,
        uid=request.course_id,
    )
    result = await agent.call_agent(
        context=Context(
            course_id=request.course_id,
            user_id=identity.id,
            prompt=request.content,
        ),
        chat=request,
    )

    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=asdict(result),
    )


@router.post(
    "/mentor",
    status_code=status.HTTP_200_OK,
)
async def chat_with_mentor(
    request: MentorChat,
    agent: MentorAgentDep,
    identity: CurrentIdentity,
    check_access: CheckCourseAccessDep,
) -> Chat:
    await check_access(
        identity=identity,
        permission=READ,
        uid=request.course_id,
    )
    result = await agent.call_agent(
        chat=request,
        context=Context(
            course_id=request.course_id,
            user_id=identity.id,
            prompt=request.content,
        ),
    )
    return Chat(
        chat_id=request.chat_id,
        course_id=request.course_id,
        role="assistant",
        content=result,
    )


@router.post(
    "/test/{module_id}/{lesson_id}",
    status_code=status.HTTP_201_CREATED,
)
async def create_test(
    module_id: UUID,
    lesson_id: UUID,
    agent: TesterAgentDep,
    identity: CurrentIdentity,
    check_access: CheckCourseAccessDep,
) -> dict[str, Any]:
    await check_access(
        identity=identity,
        permission=READ,
        uid=module_id,
    )
    return await agent.call_agent_creator(
        user_id=identity.id,
        module_id=module_id,
        lesson_id=lesson_id,
    )


@router.post(
    "/check/test/{practice_id}",
    status_code=status.HTTP_200_OK,
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
    "/practice/{module_id}/{lesson_id}",
    status_code=status.HTTP_201_CREATED,
)
async def create_practice(
    module_id: UUID,
    lesson_id: UUID,
    agent: PracticeAgentDep,
    identity: CurrentIdentity,
    check_access: CheckCourseAccessDep,
) -> dict[str, Any]:
    await check_access(
        identity=identity,
        permission=READ,
        uid=module_id,
    )
    return await agent.call_agent_creator(
        user_id=identity.id,
        module_id=module_id,
        lesson_id=lesson_id,
    )


@router.post(
    "/check/practice/{practice_id}",
    status_code=status.HTTP_200_OK,
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
