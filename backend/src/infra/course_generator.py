from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import NotRequired, TypedDict

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(usecwd=True))


@dataclass(slots=True)
class GeneratedLesson:
    """Сгенерированный черновик урока."""

    title: str
    content: str


@dataclass(slots=True)
class GeneratedModule:
    """Сгенерированный черновик модуля курса."""

    title: str
    description: str
    lessons: list[GeneratedLesson] = field(default_factory=list)
    practice_task: str = ""
    practice_criteria: list[str] = field(default_factory=list)


@dataclass(slots=True)
class GeneratedCourseDraft:
    """Сгенерированный черновик курса до сохранения в БД."""

    title: str
    description: str
    tags: list[str]
    modules: list[GeneratedModule] = field(default_factory=list)


class AgentState(TypedDict):
    """Состояние графа генерации курса."""

    topic: str
    target_audience: str
    difficulty: str
    modules_count: int
    lessons_per_module: int
    reasoning: NotRequired[str]
    draft: NotRequired[GeneratedCourseDraft]


def _strip_json(payload: str) -> str:
    """Очистка ответа модели от markdown-обертки вокруг JSON."""

    text = payload.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _to_draft(data: dict, modules_count: int, lessons_per_module: int, topic: str, difficulty: str) -> GeneratedCourseDraft:
    """Преобразование JSON-ответа модели в черновик курса с заполнением пропусков."""

    title = str(data.get("title") or f"{topic} ({difficulty})")
    description = str(data.get("description") or f"Generated course about {topic}")
    tags = [str(x) for x in (data.get("tags") or ["generated", topic.lower()])]

    raw_modules = data.get("modules") or []
    modules: list[GeneratedModule] = []

    for b in raw_modules[:modules_count]:
        lesson_titles = b.get("lesson_titles") or []
        lessons: list[GeneratedLesson] = []
        for idx, lesson_title in enumerate(lesson_titles[:lessons_per_module], start=1):
            lesson_name = str(lesson_title)
            lessons.append(
                GeneratedLesson(
                    title=lesson_name,
                    content=f"Theory for '{lesson_name}'. Edit this content in CRUD.",
                )
            )

        while len(lessons) < lessons_per_module:
            idx = len(lessons) + 1
            lesson_name = f"Lesson {idx}"
            lessons.append(
                GeneratedLesson(
                    title=lesson_name,
                    content=f"Theory for '{lesson_name}'. Edit this content in CRUD.",
                )
            )

        modules.append(
            GeneratedModule(
                title=str(b.get("title") or f"Module {len(modules) + 1}"),
                description=str(b.get("description") or "Auto-generated module"),
                lessons=lessons,
                practice_task=str(b.get("practice_task") or "Complete practical task for this module"),
                practice_criteria=[str(x) for x in (b.get("practice_criteria") or ["Correctness", "Completeness"])],
            )
        )

    while len(modules) < modules_count:
        module_index = len(modules) + 1
        lessons = [
            GeneratedLesson(
                title=f"Lesson {module_index}.{i}",
                content=f"Theory lesson {module_index}.{i} for {topic}. Edit in CRUD.",
            )
            for i in range(1, lessons_per_module + 1)
        ]
        modules.append(
            GeneratedModule(
                title=f"Module {module_index}: {topic}",
                description="Auto-generated module",
                lessons=lessons,
                practice_task=f"Practice for module {module_index}",
                practice_criteria=["Correctness", "Completeness"],
            )
        )

    return GeneratedCourseDraft(title=title, description=description, tags=tags, modules=modules)


def generate_course_draft_with_langchain(
    topic: str,
    target_audience: str,
    difficulty: str,
    modules_count: int,
    lessons_per_module: int,
    llm_model: str,
) -> GeneratedCourseDraft | None:
    """Генерация черновика курса через LangChain/LangGraph при наличии зависимостей и ключа."""

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        return None

    try:
        from langchain_openai import ChatOpenAI
        from langgraph.graph import END, START, StateGraph
    except Exception:
        return None

    base_url = os.getenv("OPENAI_BASE_URL")
    llm = ChatOpenAI(api_key=openai_key, model=llm_model, base_url=base_url, temperature=0.4)

    def reasoning_node(state: AgentState) -> dict:
        """Подготовка педагогического обоснования для структуры курса."""

        prompt = (
            "You are an instructional designer.\n"
            f"Topic: {state['topic']}\n"
            f"Audience: {state['target_audience']}\n"
            f"Difficulty: {state['difficulty']}\n"
            "Give concise pedagogical reasoning in 5-8 bullet points."
        )
        response = llm.invoke(prompt)
        reasoning = str(getattr(response, "content", "")).strip()
        return {"reasoning": reasoning}

    def plan_node(state: AgentState) -> dict:
        """Получение JSON-плана курса и преобразование его в черновик."""

        prompt = (
            "Generate JSON only. Do not include markdown fences.\n"
            "Schema:\n"
            "{\n"
            "  \"title\": string,\n"
            "  \"description\": string,\n"
            "  \"tags\": string[],\n"
            "  \"modules\": [\n"
            "    {\n"
            "      \"title\": string,\n"
            "      \"description\": string,\n"
            "      \"lesson_titles\": string[],\n"
            "      \"practice_task\": string,\n"
            "      \"practice_criteria\": string[]\n"
            "    }\n"
            "  ]\n"
            "}\n"
            f"Create exactly {state['modules_count']} modules and {state['lessons_per_module']} lessons per module.\n"
            f"Topic: {state['topic']}\n"
            f"Audience: {state['target_audience']}\n"
            f"Difficulty: {state['difficulty']}\n"
            f"Reasoning:\n{state['reasoning']}"
        )
        response = llm.invoke(prompt)
        raw = _strip_json(str(getattr(response, "content", "")))
        data = json.loads(raw)
        draft = _to_draft(
            data,
            modules_count=state["modules_count"],
            lessons_per_module=state["lessons_per_module"],
            topic=state["topic"],
            difficulty=state["difficulty"],
        )
        return {"draft": draft}

    graph = StateGraph(AgentState)
    graph.add_node("reasoning", reasoning_node)
    graph.add_node("plan", plan_node)
    graph.add_edge(START, "reasoning")
    graph.add_edge("reasoning", "plan")
    graph.add_edge("plan", END)
    agent = graph.compile()

    try:
        result = agent.invoke(
            {
                "topic": topic,
                "target_audience": target_audience,
                "difficulty": difficulty,
                "modules_count": modules_count,
                "lessons_per_module": lessons_per_module,
            }
        )
        return result.get("draft")
    except Exception:
        return None
