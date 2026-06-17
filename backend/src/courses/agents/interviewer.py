import logging
from uuid import UUID

from langchain.agents import AgentState, create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.types import Command
from pydantic import BaseModel

from ...core.infrastructure import checkpointer
from ..domain.dependencies import model
from .course_generator.tools import knowledge_search
from .course_generator.workflow import generate_course
from .prompts import INTERVIEWER_PROMPT, PROMPT_SUMMARIZE_CHAT
from .schemas import GenerationContext

logger = logging.getLogger(__name__)


class Context(BaseModel):
    course_id: UUID
    user_id: UUID


class InterviewState(AgentState):
    task_id: str | None


@tool(
    "complete_interview",
    description=(
        "Завершает интервью с пользователем, когда собраны все необходимые "
        "данные для генерации курса, и отправляет задачу на выполнение. "
        "Вызывается ровно один раз, когда интервью полностью завершено."
    ),
)
def complete_interview(
    prompt: str,
    runtime: ToolRuntime[Context],
) -> Command:
    generation_context = GenerationContext(
        user_id=runtime.context.user_id,
        course_id=runtime.context.course_id,
        prompt=prompt,
    )
    result = generate_course.delay(generation_context.model_dump_json())

    return Command(
        update={
            "task_id": result.id,
            "messages": [
                ToolMessage(
                    content=f"Курс поставлен в очередь на генерацию, task_id={result.id}",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


summarization_middleware: SummarizationMiddleware[InterviewState, Context] = (
    SummarizationMiddleware(
        model=model,
        trigger=("fraction", 0.8),
        keep=("fraction", 0.3),
        summary_prompt=PROMPT_SUMMARIZE_CHAT,
    )
)

interviewer_agent = create_agent(
    model=model,
    tools=[complete_interview, knowledge_search],
    context_schema=Context,
    state_schema=InterviewState,
    middleware=[summarization_middleware],
    system_prompt=INTERVIEWER_PROMPT,
    checkpointer=checkpointer,
)


async def chat_with_interviewer(user_id: UUID, user_prompt: str, course_id: UUID) -> dict:
    answer = await interviewer_agent.with_retry(stop_after_attempt=3).ainvoke(
        {"messages": [HumanMessage(content=user_prompt)]},
        context=Context(user_id=user_id, course_id=course_id),
        config={"configurable": {"thread_id": str(course_id)}},
    )
    result = {"reply": answer["messages"][-1].content}
    task_id = answer.get("task_id")
    if task_id:
        logger.info("Interview completed, task_id=%s, course_id=%s", task_id, course_id)
        result["task_id"] = task_id
        return result

    return result
