from typing import cast

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph

from ..schemas import RuntimeContext


async def invoke_or_resume[State](
    graph: CompiledStateGraph[State, RuntimeContext, State, State],
    *,
    input_data: State,
    config: RunnableConfig,
    context: RuntimeContext,
) -> State:
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
        return cast(State, snapshot.values)

    return await graph.ainvoke(
        input_data,
        config=config,
        context=context,
        durability="sync",
    )
