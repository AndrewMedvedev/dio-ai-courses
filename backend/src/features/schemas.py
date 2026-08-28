from typing import Any

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from uuid import UUID

from dramatiq import actor
from langchain_core.runnables import RunnableConfig
from qdrant_client import models

from src.core.infrastructure import qdrant_client, session_factory

from ..schemas import RuntimeContext
from .helper import invoke_or_resume
from .nodes import Context, agent
from .serializer import checkpointer

prompt = """Разработай учебный курс по Docker для разработчиков, которые уже пишут код, но хотят освоить контейнеризацию для локальной разработки, CI/CD и деплоя.

Целевая аудитория — разработчики (Java, Python, Go, .NET) с опытом от 1 года, знакомые с Linux-командами, но не работавшие с Docker.

Ключевые темы курса:

Оптимизация Dockerfile (многоступенчатая сборка, кэширование слоёв, минимальные базовые образы).
Работа с переменными окружения и секретами.
Docker Compose для локального окружения (разработка + тестирование).
Взаимодействие с реестрами (Docker Hub, приватные registry).
Основы оркестрации (введение в Docker Swarm / Kubernetes — только базовые концепции).
Интеграция Docker в CI/CD (на примере GitHub Actions или GitLab CI).
Практика: контейнеризация реального микросервиса с БД, кешем и очередью.
Добавь сравнительные таблицы (Docker vs виртуализация, Compose vs Swarm), рекомендации по безопасности и производительности.
"""  # ruff:ignore[line-too-long]


@actor(
    max_retries=3,  # сколько раз повторить при ошибке
    min_backoff=1000,  # мин. задержка перед повтором (мс)
    max_backoff=10000,  # макс. задержка (мс)
    store_results=True,
)
async def generate_course(generation_context: dict[str, Any]) -> dict[str, str]:
    """Генерирует курс, чтобы автоматически подготовить часть учебного контента."""
    context = Context(**generation_context)
    async with session_factory() as session:
        await invoke_or_resume(
            graph=agent,
            input_data={"generation_context": context},
            config=RunnableConfig(
                configurable={
                    "thread_id": f"course:{context.course_id}",
                }
            ),
            context=RuntimeContext(db_session=session),
        )
        return {"course_id": str(context.course_id)}


def configure_logging(level=logging.INFO):
    """Выполняет действие `configure_logging`, чтобы поддержать основной сценарий модуля."""
    logging.basicConfig(
        level=level,
        datefmt="%Y-%m-%d %H:%M:%S",
        format="[%(asctime)s.%(msecs)03d] %(module)10s:%(lineno)-3d %(levelname)-7s - %(message)s",
    )


class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        """Выполняет действие `default`, чтобы поддержать основной сценарий модуля."""
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


async def main():
    configure_logging()

    course_id = UUID("693e6c1a-44a5-46f1-a7b3-d94345a670ee")
    user_id = UUID("3887cb68-d0ab-46d0-9f15-d13d4b4fc78f")

    await checkpointer.setup()  # pyright: ignore[reportAttributeAccessIssue]

    exists = await qdrant_client.collection_exists("MAIN_COLLECTION")

    if not exists:
        await qdrant_client.create_collection(
            collection_name="MAIN_COLLECTION",
            vectors_config={
                "dense": models.VectorParams(
                    size=1024,
                    distance=models.Distance.COSINE,
                )
            },
            sparse_vectors_config={
                "bm25": models.SparseVectorParams(),
            },
        )

    # ВАЖНО: уже за пределами `if not exists`
    async with session_factory() as db_session:
        result = await invoke_or_resume(
            graph=agent,
            input_data={
                "generation_context": Context(
                    user_id=user_id,
                    course_id=course_id,
                    prompt=prompt,
                ),
            },
            context=RuntimeContext(
                db_session=db_session,
            ),
            config=RunnableConfig(
                configurable={
                    "thread_id": f"course:{course_id}",
                }
            ),
        )

    serializable_result = {}

    for key, value in result.items():
        if hasattr(value, "model_dump"):
            serializable_result[key] = value.model_dump()
        elif hasattr(value, "dict"):
            serializable_result[key] = value.dict()
        elif isinstance(value, UUID):
            serializable_result[key] = str(value)
        else:
            serializable_result[key] = value

    output_dir = Path("results")
    output_dir.mkdir(exist_ok=True)

    output_file = output_dir / "gpt_oss_120b_course_result.json"

    with output_file.open("w", encoding="utf-8") as f:
        json.dump(
            serializable_result,
            f,
            ensure_ascii=False,
            indent=2,
            cls=UUIDEncoder,
        )

    print(f"Результат сохранён в {output_file.absolute()}")


if __name__ == "__main__":
    asyncio.run(main())
