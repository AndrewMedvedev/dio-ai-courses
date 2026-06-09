from typing import Final

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from .....core.settings import settings
from ..checkpointer import checkpoint
from .prompts import PLANNER_PROMPT, CourseStructure

model: Final[ChatOpenAI] = ChatOpenAI(
    api_key=SecretStr(settings.yandex_cloud.api_key),
    base_url=settings.yandex_cloud.base_url,
    model=settings.yandex_cloud.gpt_oss_120b,
    temperature=0.2,
    max_retries=3,
    max_completion_tokens=80000,
)


course_planner_agent = create_agent(
    model=model,
    system_prompt=PLANNER_PROMPT,
    response_format=ProviderStrategy(CourseStructure),
    checkpointer=checkpoint,
)
