from typing import Any

import random
from dataclasses import asdict
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from src.llm_service import LLMTextService, Runtime
from src.shared.domain.exceptions import NotFoundError

from ...application.repos import LessonRepository, PracticeRepository
from ...domain.entities import FileUploadAssignment, Practice
from ...domain.vo import PracticeStatus, TestType
from ..course_generator.subagents.prompts import FILE_UPLOAD_PROMPT
from ..prompts import ASSIGNMENT_CHECKER_PROMPT, ASSIGNMENT_PROMPT, KNOWLEDGE_CONFIG
from ..schemas import AnyKnowledgeTest, PracticeResult


class PracticeAgents:
    def __init__(
        self,
        session: AsyncSession,
        practice_repo: PracticeRepository,
        lesson_repo: LessonRepository,
    ) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        self.session = session
        self.practice_repo = practice_repo
        self.lesson_repo = lesson_repo

    async def test_creator(
        self,
        token: str,
        runtime: Runtime,
        user_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> AnyKnowledgeTest:
        """Создает тест для студента на основе теории урока и его предыдущих практик."""
        random_type = random.choice(list(TestType))  # ruff: ignore[suspicious-non-cryptographic-random-usage]
        config = KNOWLEDGE_CONFIG.get(random_type, {})
        lesson = await self.lesson_repo.read(lesson_id)
        if lesson is None:
            raise NotFoundError(message="Урок не найден")
        messages = [
            {"role": "user", "content": ASSIGNMENT_PROMPT},
            {"role": "user", "content": f"Теория урока\n{lesson.content_blocks}"},
        ]
        practices = await self.practice_repo.read_by_module(user_id=user_id, module_id=module_id)
        if practices is not None:
            messages.append({"role": "user", "content": f"Практики студента\n{practices}"})
        agent = LLMTextService(
            token=token,
            system_prompt=config.get("system_prompt", ""),
            runtime=runtime,
        )
        response_format: AnyKnowledgeTest = config.get("response_format")  # pyright: ignore[reportAssignmentType]
        result = await agent.invoke(messages=messages, schema=response_format)
        response: AnyKnowledgeTest = TypeAdapter(response_format).validate_python(result.output)
        await self.practice_repo.create(
            Practice(
                user_id=user_id,
                module_id=module_id,
                lesson_id=lesson_id,
                practice=[asdict(response)],
            ),
        )
        await self.session.commit()
        return response

    async def practice_creator(
        self,
        token: str,
        runtime: Runtime,
        user_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> FileUploadAssignment:
        """Создает практическое задание для студента на основе теории урока и его предыдущих практик."""  # ruff: ignore[line-too-long]
        lesson = await self.lesson_repo.read(lesson_id)
        if lesson is None:
            raise NotFoundError(message="Урок не найден")
        messages = [
            {"role": "user", "content": ASSIGNMENT_PROMPT},
            {"role": "user", "content": f"Теория урока\n{lesson.content_blocks}"},
        ]
        practices = await self.practice_repo.read_by_module(user_id=user_id, module_id=module_id)
        if practices is not None:
            messages.append({"role": "user", "content": f"Практики студента\n{practices}"})
        agent = LLMTextService(
            token=token,
            system_prompt=FILE_UPLOAD_PROMPT,
            runtime=runtime,
        )
        result = await agent.invoke(messages=messages, schema=FileUploadAssignment)
        response = TypeAdapter(FileUploadAssignment).validate_python(result.output)
        await self.practice_repo.create(
            Practice(
                user_id=user_id,
                module_id=module_id,
                lesson_id=lesson_id,
                practice=[asdict(response)],
            ),
        )
        await self.session.commit()
        return response

    async def assignment_checker(
        self,
        practice: dict[str, Any],
        token: str,
        runtime: Runtime,
        user_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> PracticeResult:
        """Оставляет точку расширения для будущей проверки практических заданий."""

        agent = LLMTextService(
            token=token,
            system_prompt=ASSIGNMENT_CHECKER_PROMPT,
            runtime=runtime,
        )
        result = await agent.invoke(
            messages=[{"role": "user", "content": practice}],
            schema=PracticeResult,
        )
        response = PracticeResult.model_validate(result.output)
        if response.is_passed:
            await self.practice_repo.update(
                user_id=user_id,
                module_id=module_id,
                lesson_id=lesson_id,
                status=PracticeStatus.COMPLETED,
                practice={"practice": practice, **response.model_dump()},
            )
        else:
            await self.practice_repo.update(
                user_id=user_id,
                module_id=module_id,
                lesson_id=lesson_id,
                status=PracticeStatus.FAILED,
                practice={"practice": practice, **response.model_dump()},
            )
        await self.session.commit()
        return response
