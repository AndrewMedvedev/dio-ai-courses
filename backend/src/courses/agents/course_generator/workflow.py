import asyncio
import json
import logging
from asyncio import run
from collections.abc import Awaitable, Callable
from datetime import datetime
from functools import wraps
from pathlib import Path
from uuid import UUID, uuid4

from celery import Task  # type: ignore  # noqa: PGH003
from langchain_core.runnables import RunnableConfig

from ....core.infrastructure import celery_client
from .nodes import GenerationContext, agent

prompt = """Создай учебный курс по работе с конфигурацией «1С:Зарплата и управление персоналом», редакция 3.1.
Целевая аудитория — начинающие специалисты по кадровому учёту и расчёту зарплаты.
"""


def task(**task_kwargs) -> Callable[[Callable[..., Awaitable]], Task]:
    def decorator(coro_func: Callable[..., Awaitable]) -> Task:
        @celery_client.task(**task_kwargs)
        @wraps(coro_func)
        def wrapper(*args, **kwargs):
            return run(coro_func(*args, **kwargs))  # type: ignore  # noqa: PGH003

        return wrapper  # type: ignore  # noqa: PGH003

    return decorator


@task(name="generate_course")
async def generate_course(generation_context: dict) -> dict:
    try:
        await agent.ainvoke(
            {"generation_context": generation_context},  # type: ignore  # noqa: PGH003
            config=RunnableConfig(
                configurable={"thread_id": f"course:{generation_context['course_id']}"}
            ),
        )
    except Exception as e:  # noqa: BLE001
        return {"allowed": False, "reason": str(e)}

    return {"allowed": True}


def configure_logging(level=logging.INFO):
    logging.basicConfig(
        level=level,
        datefmt="%Y-%m-%d %H:%M:%S",
        format="[%(asctime)s.%(msecs)03d] %(module)10s:%(lineno)-3d %(levelname)-7s - %(message)s",
    )


class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


async def main():
    configure_logging()
    course_id = uuid4()
    result = await agent.ainvoke(
        {
            "generation_context": GenerationContext(
                user_id=uuid4(),
                course_id=course_id,
                prompt=prompt,
            )
        },
        config=RunnableConfig(configurable={"course_id": f"course:{course_id}"}),
    )

    # Преобразуем результат в сериализуемый словарь
    # Вариант 1: если result — это словарь с Pydantic-моделями
    serializable_result = {}
    for key, value in result.items():
        if hasattr(value, "model_dump"):  # Pydantic v2
            serializable_result[key] = value.model_dump()
        elif hasattr(value, "dict"):  # Pydantic v1
            serializable_result[key] = value.dict()
        elif isinstance(value, uuid4.__class__):  # UUID
            serializable_result[key] = str(value)
        else:
            serializable_result[key] = value

    # Или упрощённо, если вы точно знаете структуру (например, в result["generation_context"])
    # serializable_result = result.copy()
    # serializable_result["generation_context"] = result["generation_context"].model_dump()
    # serializable_result["user_id"] = str(result["user_id"])  # если есть прямые UUID

    # Создаём путь к файлу с помощью pathlib
    output_dir = Path("results")

    output_dir.mkdir(exist_ok=True)  # создаём папку, если её нет
    output_file = output_dir / "gpt_oss_120b_course_result.json"

    # Сохраняем в JSON
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(serializable_result, f, ensure_ascii=False, indent=2, cls=UUIDEncoder)

    print(f"Результат сохранён в {output_file.absolute()}")


if __name__ == "__main__":
    asyncio.run(main())
