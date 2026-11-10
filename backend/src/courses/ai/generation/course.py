# pyright: reportReturnType=false
from typing import Any, NotRequired, TypedDict

import logging
import time
from asyncio import Semaphore
from asyncio.taskgroups import TaskGroup

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.ai.agents.reasoner import reasoner_agent
from src.courses.ai.generation.module import ModuleAgentState
from src.courses.ai.helper import invoke_or_resume
from src.courses.ai.prompts.few_shots import COURSE_STRUCTURE_FEW_SHOT
from src.courses.ai.prompts.generation.structure import COURSE_STRUCTURE_PROMPT
from src.courses.ai.prompts.models import CourseStructure
from src.courses.ai.schemas.contexts import Context
from src.courses.application.catalog.repos import (
    CourseRepository,
)
from src.courses.application.generation.contracts import (
    CourseDict,
    CourseStructureDict,
    ModuleDict,
)
from src.courses.application.generation.mapping import (
    course_to_dict,
    dict_to_course,
    model_to_typed_dict,
)
from src.courses.domain.catalog.entities import (
    Course,
)
from src.courses.domain.catalog.enums import (
    CourseStatus,
)
from src.courses.domain.catalog.ranking import (
    generate_ranks,
)
from src.courses.infra.services import course_client
from src.llm_service import LLMTextService, Runtime

logger = logging.getLogger(__name__)


class CourseAgentState(TypedDict):
    generation_context: Context  # Контекстная информация курса
    thinks: NotRequired[str]  # Мысли - план reasoning агента
    course_structure: NotRequired[CourseStructureDict]  # Сгенерированная структура курса
    course: NotRequired[CourseDict]  # Готовый курс


class CourseAgent:
    def __init__(
        self,
        session: AsyncSession,
        repo: CourseRepository,
        module_agent: CompiledStateGraph[ModuleAgentState, Any],
        max_parallel: int = 3,
    ):
        self._session = session
        self._repo = repo
        self._module_agent = module_agent
        self.semaphore = Semaphore(max_parallel)

    async def reasoning(
        self,
        state: CourseAgentState,
    ) -> dict[str, str]:
        """Размышление над запросом преподавателя"""
        if state.get("thinks") is not None:
            return {"thinks": state.get("thinks", "")}
        start_time = time.monotonic()
        logger.info("Course generator in reasoning state ...")

        agent = reasoner_agent(
            runtime=Runtime(
                context=state["generation_context"],
            )
        )
        result = await agent.invoke(
            messages=[{"role": "user", "content": state["generation_context"].prompt}]
        )
        elapsed_time = time.monotonic() - start_time
        logger.info("Reasoning finished, time spent %s seconds", round(elapsed_time, 2))
        return {"thinks": result.raw_text}

    async def plan_course_structure(
        self,
        state: CourseAgentState,
    ) -> dict[str, dict[str, Any]]:
        """Планирование структуры курса используя информацию, полученную в ходе размышлений"""

        logger.info(
            "Planning course structure using thinks: '%s ...'", state.get("thinks", "")[:150]
        )

        agent = LLMTextService(
            client=course_client,
            system_prompt=COURSE_STRUCTURE_PROMPT,
        )
        result = await agent.invoke(
            messages=[
                *COURSE_STRUCTURE_FEW_SHOT,
                {"role": "user", "content": state.get("thinks", "")},
            ],
            schema=CourseStructure,
        )
        course_structure = CourseStructure.model_validate(result.output)
        course = Course(
            id=state["generation_context"].course_id,
            creator_id=state["generation_context"].user_id,
            organization_id=state["generation_context"].organization_id,
            difficulty=course_structure.difficulty,
            status=CourseStatus.IN_GENERATION,
            title=course_structure.title,
            description=course_structure.description,
            learning_objectives=course_structure.learning_objectives,
            tags=course_structure.tags,
        )
        logger.info("Added `title`, `description` and `learning_objectives` in course")
        return {
            "course_structure": model_to_typed_dict(course_structure),
            "course": course_to_dict(course),
        }

    async def save_course(
        self,
        state: CourseAgentState,
    ) -> None:
        """Сохраняет курс, чтобы результат был доступен после завершения операции."""

        course = dict_to_course(state["course"])  # pyright: ignore[reportTypedDictNotRequiredAccess]
        try:
            await self._repo.create(course)
            logger.info("Saving course '%s' to database ...", course.title)
            await self._session.commit()
        except IntegrityError:
            await self._session.rollback()
            logger.info("Course %s alredy exsists", course.title)

    async def build_module(
        self,
        generation_context: Context,
        rank: str,
        module_description: str,
        audience_description: str,
        learning_objectives: list[str],
    ) -> ModuleDict:
        module_thread_id = f"course:{generation_context.course_id}:module:{rank}"

        logger.info(
            "Generating module with rank %s",
            rank,
        )

        async with self.semaphore:
            result = await invoke_or_resume(
                self._module_agent,
                input_data={
                    "generation_context": generation_context,
                    "audience_description": audience_description,
                    "learning_objectives": learning_objectives,
                    "rank": rank,
                    "module_description": module_description,
                },
                config=RunnableConfig(
                    configurable={
                        "thread_id": module_thread_id,
                    }
                ),
            )

            return result["module"]

    async def generate_modules(
        self,
        state: CourseAgentState,
    ) -> dict[str, CourseDict]:
        course_structure = state["course_structure"]  # pyright: ignore[reportTypedDictNotRequiredAccess]
        course = state["course"]  # pyright: ignore[reportTypedDictNotRequiredAccess]

        descriptions = course_structure["module_descriptions"]
        ranks = generate_ranks(len(descriptions))

        async with TaskGroup() as tg:
            tasks = [
                tg.create_task(
                    self.build_module(
                        generation_context=state["generation_context"],
                        rank=rank,
                        module_description=description,
                        audience_description=course_structure["audience_description"],
                        learning_objectives=course_structure["learning_objectives"],
                    )
                )
                for description, rank in zip(descriptions, ranks, strict=True)
            ]

        modules = sorted(
            (task.result() for task in tasks),
            key=lambda module: module["rank"],
        )

        course["modules"].extend(modules)

        return {"course": course}

    async def update_course(
        self,
        state: CourseAgentState,
    ) -> None:
        course = dict_to_course(state["course"])  # pyright: ignore[reportTypedDictNotRequiredAccess]
        course.change_status(CourseStatus.DRAFT)
        await self._repo.update(course)
        logger.info("Update course '%s' to database ...", course.title)

        await self._session.commit()


def build_course_graph(
    agent: CourseAgent,
    checkpointer: AsyncPostgresSaver,
) -> CompiledStateGraph[CourseAgentState]:

    graph = StateGraph(CourseAgentState)

    graph.add_node("reasoning", agent.reasoning)
    graph.add_node("plan_course_structure", agent.plan_course_structure)
    graph.add_node("save_course", agent.save_course)
    graph.add_node("generate_modules", agent.generate_modules)
    graph.add_node("update_course", agent.update_course)
    graph.add_edge(START, "reasoning")
    graph.add_edge("reasoning", "plan_course_structure")
    graph.add_edge("plan_course_structure", "save_course")
    graph.add_edge("save_course", "generate_modules")
    graph.add_edge("generate_modules", "update_course")
    graph.add_edge("update_course", END)

    return graph.compile(checkpointer=checkpointer)
