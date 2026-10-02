from typing import Any

from dataclasses import asdict

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph

from ....shared.domain.entities import Entity
from ..schemas import RuntimeContext


def generation_data(entity: Entity) -> dict[str, Any]:
    """Преобразует сущность в состояние генерации без событий и участников курса."""
    return asdict(entity, dict_factory=lambda pairs: {
        key: value for key, value in pairs if key not in {"_events", "members"}
    })


async def invoke_or_resume(
    graph: CompiledStateGraph[Any, RuntimeContext, Any, Any],
    *,
    input_data: dict[str, Any],
    config: RunnableConfig,
    context: RuntimeContext,
) -> dict[str, Any]:
    snapshot = await graph.aget_state(config)

    # Завершённая задача может иметь pending writes без следующей контрольной точки.
    if snapshot.next or snapshot.tasks:
        return await graph.ainvoke(
            None,
            config=config,
            context=context,
            durability="sync",
        )

    if snapshot.values:
        return dict(snapshot.values)

    return await graph.ainvoke(
        input_data,
        config=config,
        context=context,
        durability="sync",
    )
