from typing import Any

import base64
import json
from dataclasses import asdict
from uuid import UUID

from pydantic import TypeAdapter

from src.courses.ai.prompts.practice.assignment import ASSIGNMENT_PROMPT
from src.courses.ai.prompts.practice.file_upload import (
    FILE_UPLOAD_PROMPT,
    PRACTICE_FILE_CHECKER_PROMPT,
)
from src.courses.ai.schemas.practicies import PracticeResult
from src.courses.application.assessment.repos import (
    PracticeRepository,
)
from src.courses.application.catalog.repos import (
    LessonRepository,
)
from src.courses.domain.assessment.entities import (
    Practice,
)
from src.courses.domain.assessment.enums import (
    PracticeStatus,
)
from src.courses.domain.catalog.vo import (
    FileUploadAssignment,
)
from src.courses.domain.learning.events import (
    LessonProgressUpdate,
    LessonProgressUpdated,
)
from src.courses.infra.services import course_client
from src.llm_service import LLMTextService
from src.shared.application.transaction import Transaction
from src.shared.domain.exceptions import NotFoundError
from src.shared.utils.time import current_datetime


class PracticerAgent:
    def __init__(
        self,
        practice_repo: PracticeRepository,
        lesson_repo: LessonRepository,
        transaction: Transaction,
    ) -> None:
        self.practice_repo = practice_repo
        self.lesson_repo = lesson_repo
        self.transaction = transaction

    async def call_agent_creator(
        self,
        user_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> dict[str, Any]:
        lesson = await self.lesson_repo.read(lesson_id)
        if lesson is None:
            raise NotFoundError(message="Урок не найден")
        messages = [
            {"role": "user", "content": ASSIGNMENT_PROMPT},
            {"role": "user", "content": f"Теория урока\n{lesson.content_blocks}"},
        ]
        practices = await self.practice_repo.read_by_module(user_id=user_id, module_id=module_id)
        if practices is not None:
            messages.append(
                {
                    "role": "user",
                    "content": f"Практики студента\n{json.dumps(practices, ensure_ascii=False, indent=2)}",
                }
            )
        agent = LLMTextService(
            client=course_client,
            system_prompt=FILE_UPLOAD_PROMPT,
        )
        result = await agent.invoke(messages=messages, schema=FileUploadAssignment)
        practice = TypeAdapter(FileUploadAssignment).validate_python(result.output)
        created = await self.practice_repo.create(
            Practice(
                user_id=user_id,
                module_id=module_id,
                lesson_id=lesson_id,
                practice=[asdict(practice)],
            ),
        )
        await self.transaction(created)
        return {"practice": practice, "practice_id": created.id}

    async def call_agent_checker(
        self,
        practice: dict[str, Any],
        file: bytes,
        practice_id: UUID,
    ) -> PracticeResult:
        """Проверяет практику, сохраняет результат и публикует событие при успешном прохождении."""
        if not (current_practice := await self.practice_repo.read(practice_id)):
            raise NotFoundError("Practice was not found")

        file_str = base64.b64encode(file).decode("utf-8")
        agent = LLMTextService(
            client=course_client,
            system_prompt=PRACTICE_FILE_CHECKER_PROMPT,
        )
        result = await agent.invoke(
            messages=[
                {"role": "user", "content": json.dumps(practice, ensure_ascii=False, indent=2)},
                {"role": "user", "content": f"Результат выполнения практики\n{file_str}"},
            ],
            schema=PracticeResult,
        )
        response = PracticeResult.model_validate(result.output)
        if response.is_passed:
            current_practice.edit(
                status=PracticeStatus.COMPLETED,
                practice={"practice": practice, **response.model_dump()},
            )
            await self.practice_repo.update(current_practice)
            current_practice.register_event(
                LessonProgressUpdated(
                    user_id=current_practice.user_id,
                    lesson_id=current_practice.lesson_id,
                    progress=LessonProgressUpdate(practice_completed_at=current_datetime()),
                )
            )
        else:
            current_practice.edit(
                status=PracticeStatus.FAILED,
                practice={"practice": practice, **response.model_dump()},
            )
            await self.practice_repo.update(current_practice)
        await self.transaction(current_practice)
        return response
