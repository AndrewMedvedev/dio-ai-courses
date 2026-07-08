from aiohttp import ClientSession

from .....llm_service import LLMService
from .prompts import PLANNER_PROMPT


async def course_planner_agent(session: ClientSession) -> LLMService:  # noqa: RUF029
    return LLMService(session=session, system_prompt=PLANNER_PROMPT)
