from __future__ import annotations

from typing import Annotated, Any, get_args, get_origin, get_type_hints

import inspect
from collections.abc import Callable

from pydantic import BaseModel, ConfigDict, Field, create_model
from pydantic_core import PydanticUndefined

from .dataclasses import StructuredTool


class InjectedToolArg:
    """Маркер для injected параметров."""


def _is_injected(annotation: Any) -> bool:
    if get_origin(annotation) is Annotated:
        return any(isinstance(m, InjectedToolArg) for m in get_args(annotation)[1:])
    return False


def _build_args_model(func: Callable, model_name: str) -> type[BaseModel]:
    """Создаёт Pydantic модель, исключая 'runtime' и injected параметры."""
    sig = inspect.signature(func)
    hints = get_type_hints(func, include_extras=True)
    fields: dict[str, tuple[Any, Any]] = {}

    for name, param in sig.parameters.items():
        if name in {"self", "cls"} or param.kind in {param.VAR_POSITIONAL, param.VAR_KEYWORD}:
            continue

        # Исключаем runtime и injected параметры
        if name == "runtime" or _is_injected(hints.get(name, Any)):
            continue

        annotation = hints.get(name, Any)
        real_type = get_args(annotation)[0] if get_origin(annotation) is Annotated else annotation

        default = param.default if param.default is not param.empty else PydanticUndefined
        fields[name] = (real_type, Field(default=default))

    return create_model(  # pyright: ignore[reportCallIssue, reportUnknownVariableType]
        model_name,
        __config__=ConfigDict(extra="forbid", arbitrary_types_allowed=True),
        **fields,  # pyright: ignore[reportArgumentType]
    )


def tool(
    name_or_callable: str | Callable | None = None,
    *,
    name: str | None = None,
    description: str | None = None,
) -> StructuredTool | Callable[[Callable], StructuredTool]:

    def decorator(func: Callable) -> StructuredTool:
        tool_name = name or (
            name_or_callable if isinstance(name_or_callable, str) else func.__name__
        )

        model = _build_args_model(func, tool_name)
        schema = model.model_json_schema()

        tool_schema = {
            "name": tool_name,
            "description": description or inspect.getdoc(func) or "No description provided.",
            "parameters": {
                "type": "object",
                "properties": {
                    k: {kk: vv for kk, vv in v.items() if kk != "title"}
                    for k, v in schema.get("properties", {}).items()
                },
                "required": schema.get("required", []),
                "additionalProperties": False,
            },
        }

        # Проверяем, есть ли параметр runtime в оригинальной функции
        has_runtime = "runtime" in inspect.signature(func).parameters

        return StructuredTool(
            func=func,
            name=tool_name,
            args_schema=tool_schema,
            runtime=has_runtime,  # ← добавляем флаг
        )

    if callable(name_or_callable):
        return decorator(name_or_callable)
    return decorator
