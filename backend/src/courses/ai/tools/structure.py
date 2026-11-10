# pyright: reportOptionalMemberAccess=false

from typing import Any

import logging

from pydantic import BaseModel, Field

from src.courses.ai.prompts.few_shots import (
    COURSE_STRUCTURE_FEW_SHOT,
    LESSON_STRUCTURE_FEW_SHOT,
    MODULE_STRUCTURE_FEW_SHOT,
)
from src.courses.ai.prompts.generation.structure import (
    COURSE_STRUCTURE_PROMPT,
    LESSON_STRUCTURE_PROMPT,
    MODULE_STRUCTURE_PROMPT,
)
from src.courses.ai.prompts.models import (
    CourseStructure,
    LessonStructure,
    ModuleStructure,
)
from src.courses.ai.schemas.contexts import CourseContext
from src.courses.ai.tools.send_generation import State
from src.llm_service import Runtime, tool
from src.llm_service.services import LLMTextService

logger = logging.getLogger(__name__)


class MaterialsInput(BaseModel):
    materials: str = Field(description="Собранные данные в ходе интервью с пользователем")


@tool(
    name="generate_course_structure",
    description="""\
    Создает структуру курса с примерной стоимостью в рублях.
    """,
)
async def generate_course_structure(
    schema: MaterialsInput,
    runtime: Runtime[CourseContext, State],
) -> dict[str, dict[str, Any] | str]:
    agent = LLMTextService(client=runtime.state.client, system_prompt=COURSE_STRUCTURE_PROMPT)
    request = await agent.invoke(
        messages=[
            *COURSE_STRUCTURE_FEW_SHOT,
            {
                "role": "user",
                "content": schema.materials,
            },
        ],
        schema=CourseStructure,
    )
    result = CourseStructure.model_validate(request.output)

    return {
        "plan": result.model_dump(mode="json"),
        "cost": f"{len(result.module_descriptions) * 10 * 10 * 4} рублей",
    }


@tool(
    name="generate_module_structure",
    description="""\
    Создает структуру модуля с примерной стоимостью в рублях.
    """,
)
async def generate_module_structure(
    schema: MaterialsInput,
    runtime: Runtime[CourseContext, State],
) -> dict[str, dict[str, Any] | str]:
    agent = LLMTextService(client=runtime.state.client, system_prompt=MODULE_STRUCTURE_PROMPT)
    request = await agent.invoke(
        messages=[
            *MODULE_STRUCTURE_FEW_SHOT,
            {
                "role": "user",
                "content": schema.materials,
            },
        ],
        schema=ModuleStructure,
    )
    result = ModuleStructure.model_validate(request.output)

    return {
        "plan": result.model_dump(mode="json"),
        "cost": f"{len(result.lessons_descriptions) * 10 * 4} рублей",
    }


@tool(
    name="generate_lesson_structure",
    description="""\
    Создает структуру урока с примерной стоимостью в рублях.
    """,
)
async def generate_lesson_structure(
    schema: MaterialsInput,
    runtime: Runtime[CourseContext, State],
) -> dict[str, dict[str, Any] | str]:
    agent = LLMTextService(client=runtime.state.client, system_prompt=LESSON_STRUCTURE_PROMPT)
    request = await agent.invoke(
        messages=[
            *LESSON_STRUCTURE_FEW_SHOT,
            {
                "role": "user",
                "content": schema.materials,
            },
        ],
        schema=LessonStructure,
    )
    result = LessonStructure.model_validate(request.output)

    return {
        "plan": result.model_dump(mode="json"),
        "cost": f"{len(result.content_plan) * 4} рублей",
    }
