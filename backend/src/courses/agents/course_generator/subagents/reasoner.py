# Агент - мыслитель, продумывает и рефлексирует над данными от преподавателя


import logging

from aiohttp import ClientSession
from pydantic import BaseModel, Field

from .....llm_service import LLMTextService, Runtime, tool
from ...middlewares import LemmatizationMiddleware, ToolCallLimitMiddleware
from ...schemas import GenerationContext
from ...tools import browse_page, web_search
from ..tools import knowledge_search, save_knowledge
from .prompts import CRITIC_PROMPT, REASONER_PROMPT, RESEARCHER_PROMPT

logger = logging.getLogger(__name__)


@tool(name="call_critique_agent", description="Вызвать агента критика")  # pyright: ignore[reportCallIssue]
async def call_critique_agent(runtime: Runtime[GenerationContext, ClientSession]) -> dict:
    logger.info("Call critique agent")
    prompt = runtime.context.prompt  # pyright: ignore[reportAttributeAccessIssue]
    critic_agent = LLMTextService(
        session=runtime.state,  # pyright: ignore[reportArgumentType]
        system_prompt=CRITIC_PROMPT.format(prompt=prompt),
    )
    result = await critic_agent.invoke(messages=runtime.messages)
    return result.raw_text  # pyright: ignore[reportReturnType]


class ResearchInput(BaseModel):
    """Входные параметры для агента исследователя"""

    task: str = Field(description="Задача для исследования")


@tool(  # pyright: ignore[reportCallIssue]
    name="call_researcher_agent", description="Вызвать агента исследователя"
)
async def call_researcher_agent(
    runtime: Runtime[GenerationContext, ClientSession],
    schema: ResearchInput,
) -> dict:
    logger.info("Call researcher agent")
    researcher_agent = LLMTextService(
        session=runtime.state,  # pyright: ignore[reportArgumentType]
        system_prompt=RESEARCHER_PROMPT,
        tools={  # pyright: ignore[reportArgumentType]
            "knowledge_search": knowledge_search,
            "web_search": web_search,
            "browse_page": browse_page,
            "save_knowledge": save_knowledge,
        },
        runtime=Runtime(context=runtime.context, state=runtime.state),
        middlewares=[
            ToolCallLimitMiddleware(
                tool_limits={"web_search": 3, "browse_page": 4, "knowledge_search": 3}
            ),
            LemmatizationMiddleware(),
        ],
    )
    result = await researcher_agent.invoke(messages=[{"role": "user", "content": schema.task}])
    return result.output  # pyright: ignore[reportReturnType]


def reasoner_agent(
    runtime: Runtime[GenerationContext, ClientSession],
) -> LLMTextService:

    return LLMTextService(
        session=runtime.state,  # pyright: ignore[reportArgumentType]
        system_prompt=REASONER_PROMPT.format(prompt=runtime.context.prompt),  # pyright: ignore[reportAttributeAccessIssue]
        tools={  # pyright: ignore[reportArgumentType]
            "call_researcher_agent": call_researcher_agent,
            "call_critique_agent": call_critique_agent,
        },
        middlewares=[
            LemmatizationMiddleware(),
            ToolCallLimitMiddleware(tool_limits={"call_researcher_agent": 2}),
        ],
        runtime=runtime,
    )
