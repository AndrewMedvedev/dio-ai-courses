from .....llm_service import LLMTextService
from .prompts import PLANNER_PROMPT


def course_planner_agent() -> LLMTextService:
    return LLMTextService(system_prompt=PLANNER_PROMPT)
