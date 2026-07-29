# Агент для проверки практических заданий студентов

from typing import Any

import logging

from ...llm_service import LLMTextService
from ..domain.entities import AnyAssignment
from ..schemas import AssignmentResult
from ..utils.formatting import get_assignment_context
from .prompts import ASSIGNMENT_CHECKER_PROMPT

logger = logging.getLogger(__name__)


async def call_assignment_checker(
    assignment: AnyAssignment,
    submission_data: dict[str, Any],
) -> AssignmentResult:
    """Вызвать агента для проверки практических заданий"""

    logger.info("Calling `%s` assignment checker agent ...", assignment.assignment_type)
    prompt_template = (
        f"{get_assignment_context(assignment)}\n\n"
        "## Работа студента\n"
        f"**Расширение файла:** {submission_data.get('file_extension')}\n"
        "**Содержимое файла:**\n"
        f"{submission_data.get('md_text')}"
    )
    result = await LLMTextService(system_prompt=ASSIGNMENT_CHECKER_PROMPT).invoke(
        messages=[{"role": "user", "content": prompt_template}], schema=AssignmentResult
    )
    return AssignmentResult.model_validate(result.output)
