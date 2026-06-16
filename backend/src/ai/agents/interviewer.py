import logging

from langchain.agents import create_agent
from langchain.tools import tool

from ..domain.dependencies import model
from .course_generator.tools import knowledge_search
from .course_generator.workflow import generate_course
from .prompts import INTERVIEWER_PROMPT
from .schemas import GenerationContext

logger = logging.getLogger(__name__)


@tool(
    "complete_interview",
    description="Завершает интервью с пользователем и отправляет задачу на выполнение",
)
async def complete_interview(context: GenerationContext) -> dict:  # noqa: RUF029
    generation_context = context.model_dump_json()
    result = generate_course.delay(generation_context)
    return {"task_id": result.id}


interviewer_agent = create_agent(
    model=model,
    tools=[complete_interview, knowledge_search],
    context_schema=GenerationContext,
    system_prompt=INTERVIEWER_PROMPT,
)
