# Агент - мыслитель, продумывает и рефлексирует над данными от преподавателя

from typing import Any

import logging
from uuid import uuid4

from langchain.agents import create_agent
from langchain.agents.middleware import ModelRequest, ToolCallLimitMiddleware, dynamic_prompt
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import BaseModel, Field

from ....domain.dependencies import model
from ...schemas import GenerationContext
from ...tools import browse_page, web_search
from ..tools import knowledge_search, save_knowledge
from .prompts import CRITIC_PROMPT, REASONER_PROMPT, RESEARCHER_PROMPT

logger = logging.getLogger(__name__)


@tool("call_critique_agent", description="Вызвать агента критика")
async def call_critique_agent(runtime: ToolRuntime[GenerationContext]) -> str:
    prompt = runtime.context.prompt
    critic_agent = create_agent(model=model, system_prompt=CRITIC_PROMPT.format(prompt=prompt))
    result = await critic_agent.ainvoke({"messages": runtime.state["messages"]})
    return result["messages"][-1].content


class ResearchInput(BaseModel):
    """Входные параметры для агента исследователя"""

    task: str = Field(description="Задача для исследования")


@tool(
    "call_researcher_agent",
    description="Вызвать агента исследователя",
    args_schema=ResearchInput,
)
async def call_researcher_agent(runtime: ToolRuntime[GenerationContext], task: str) -> str:
    researcher_agent = create_agent(
        model=model,
        system_prompt=RESEARCHER_PROMPT,
        tools=[knowledge_search, web_search, browse_page, save_knowledge],
        middleware=[
            # Исправление 4: явное указание типов для ToolCallLimitMiddleware
            ToolCallLimitMiddleware[Any, GenerationContext](
                tool_name="web_search", run_limit=2, thread_limit=4
            ),
            ToolCallLimitMiddleware[Any, GenerationContext](
                tool_name="browse_page", run_limit=2, thread_limit=4
            ),
        ],
        context_schema=GenerationContext,
        checkpointer=InMemorySaver(),
    )
    # Исправление 3: передаём сообщения как список кортежей
    result = await researcher_agent.ainvoke(
        input={"messages": [HumanMessage(content=task)]},
        context=runtime.context,
        config={"configurable": {"thread_id": str(uuid4())}},
    )  # type: ignore  # noqa: PGH003

    return result["messages"][-1].content


@dynamic_prompt
def dynamic_reasoner_prompt(request: ModelRequest) -> str:
    return REASONER_PROMPT.format(prompt=request.runtime.context.prompt)  # type: ignore  # noqa: PGH003


reasoner_agent = create_agent(
    model=model,
    middleware=[
        dynamic_reasoner_prompt,  # type: ignore  # noqa: PGH003
        ToolCallLimitMiddleware[Any, GenerationContext](
            tool_name="call_researcher_agent", run_limit=2, thread_limit=4
        ),  # type: ignore  # noqa: PGH003
    ],
    tools=[call_researcher_agent, call_critique_agent],
    context_schema=GenerationContext,
    checkpointer=InMemorySaver(),
)  # type: ignore  # noqa: PGH003
