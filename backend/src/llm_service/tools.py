from __future__ import annotations

from typing import Annotated, Any, get_args, get_origin, get_type_hints

import inspect
from collections.abc import Callable

from pydantic import BaseModel, ConfigDict, Field, create_model
from pydantic.fields import FieldInfo
from pydantic_core import PydanticUndefined

from .dataclasses import ParamGroup, StructuredTool


class InjectedToolArg:
    """Маркер для injected параметров."""


def _is_injected(annotation: Any) -> bool:
    if get_origin(annotation) is Annotated:
        return any(isinstance(m, InjectedToolArg) for m in get_args(annotation)[1:])
    return False


def _unwrap_annotated(annotation: Any) -> Any:
    if get_origin(annotation) is Annotated:
        return get_args(annotation)[0]
    return annotation


def _is_basemodel(tp: Any) -> bool:
    return inspect.isclass(tp) and issubclass(tp, BaseModel)


def _build_args_model_and_groups(
    func: Callable, model_name: str
) -> tuple[type[BaseModel], dict[str, ParamGroup]]:
    """
    Строит плоскую Pydantic-модель аргументов инструмента и карту
    param_groups — как из плоских аргументов (присланных LLM) собрать
    реальные kwargs для вызова func.
    """
    sig = inspect.signature(func)
    hints = get_type_hints(func, include_extras=True)

    fields: dict[str, tuple[Any, Any]] = {}
    param_groups: dict[str, ParamGroup] = {}
    seen_flat_names: set[str] = set()

    for name, param in sig.parameters.items():
        if name in {"self", "cls"} or param.kind in {
            param.VAR_POSITIONAL,
            param.VAR_KEYWORD,
        }:
            continue

        annotation = hints.get(name, Any)

        if name == "runtime" or _is_injected(annotation):
            # Не часть схемы для LLM — передаётся вызывающим кодом напрямую.
            continue

        real_type = _unwrap_annotated(annotation)

        if _is_basemodel(real_type):
            # Разворачиваем поля вложенной модели в плоские top-level поля.
            sub_field_names: list[str] = []
            for sub_name, sub_field in real_type.model_fields.items():
                if sub_name in seen_flat_names:
                    raise ValueError(
                        f"Конфликт имён: поле '{sub_name}' из модели "
                        f"'{real_type.__name__}' уже используется другим "
                        f"параметром инструмента '{model_name}'."
                    )
                seen_flat_names.add(sub_name)
                sub_field_names.append(sub_name)
                # deepcopy, чтобы не шарить один и тот же FieldInfo между моделями
                fields[sub_name] = (sub_field.annotation, __import__("copy").deepcopy(sub_field))

            param_groups[name] = ParamGroup(
                kind="model",
                model_cls=real_type,
                field_names=sub_field_names,
            )
            continue

        # Обычный "плоский" параметр.
        if name in seen_flat_names:
            raise ValueError(f"Дублирующееся имя параметра '{name}' в инструменте '{model_name}'.")
        seen_flat_names.add(name)

        if isinstance(param.default, FieldInfo):
            # Поддержка `x: str = Field(..., description="...")` прямо в сигнатуре.
            field_info = param.default
        else:
            default = param.default if param.default is not param.empty else PydanticUndefined
            field_info = Field(default=default)

        fields[name] = (real_type, field_info)
        param_groups[name] = ParamGroup(kind="flat", model_cls=None, field_names=[name])

    args_model = create_model(  # pyright: ignore[reportCallIssue]
        model_name,
        __config__=ConfigDict(extra="forbid", arbitrary_types_allowed=True),
        **fields,  # pyright: ignore[reportArgumentType]
    )
    return args_model, param_groups


def _resolve_refs(schema: dict) -> dict:
    """
    Инлайнит $defs/$ref в properties — на случай, если внутри
    расплющенных полей остались собственные вложенные BaseModel,
    которые Pydantic решил вынести в $defs.
    """
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref_name = node["$ref"].rsplit("/", 1)[-1]
                resolved = resolve(defs.get(ref_name, {}))
                return {**resolved, **{k: v for k, v in node.items() if k != "$ref"}}
            return {k: resolve(v) for k, v in node.items()}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return {
        "properties": resolve(schema.get("properties", {})),
        "required": schema.get("required", []),
    }


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

        args_model, param_groups = _build_args_model_and_groups(func, tool_name)
        resolved = _resolve_refs(args_model.model_json_schema())

        tool_schema = {
            "name": tool_name,
            "description": description or inspect.getdoc(func) or "No description provided.",
            "parameters": {
                "type": "object",
                "properties": {
                    k: {kk: vv for kk, vv in v.items() if kk != "title"}
                    for k, v in resolved["properties"].items()
                },
                "required": resolved["required"],
                "additionalProperties": False,
            },
        }

        has_runtime = "runtime" in inspect.signature(func).parameters

        return StructuredTool(
            func=func,
            name=tool_name,
            args_schema=tool_schema,
            runtime=has_runtime,
            args_model=args_model,
            param_groups=param_groups,
        )

    if callable(name_or_callable):
        return decorator(name_or_callable)
    return decorator
