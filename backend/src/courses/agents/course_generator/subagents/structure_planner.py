from aiohttp import ClientSession

from .....llm_service import LLMTextService
from .prompts import PLANNER_PROMPT


def course_planner_agent(session: ClientSession) -> LLMTextService:
    return LLMTextService(session=session, system_prompt=PLANNER_PROMPT)
