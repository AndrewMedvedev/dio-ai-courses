from typing import Annotated, Any, get_args, get_origin, get_type_hints

import inspect
import re
from collections.abc import Callable

from pydantic import BaseModel
from pydantic.fields import FieldInfo

from .dataclasses import StructuredTool


def parse_docstring_params(docstring: str) -> dict[str, str]:
    """Парсер Google-style docstring."""
    if not docstring:
        return {}
    param_desc = {}
    in_args = False
    for line in docstring.split("\n"):
        stripped = line.strip()
        if re.match(r"^(Args|Arguments|Parameters):", stripped, re.IGNORECASE):
            in_args = True
            continue
        if in_args and re.match(r"^(Returns?|Raises?|Notes?|Examples?):", stripped, re.IGNORECASE):
            break
        if in_args and stripped:
            match = re.match(r"^(\w+):\s*(.+)", stripped)
            if match:
                param_desc[match.group(1)] = match.group(2).strip()
    return param_desc


def function_to_schema(
    func: Callable,
    name: str | None = None,
    description: str | None = None,
) -> StructuredTool:
    """Создаёт schema аналогично LangChain, но args_schema — это готовый JSON Schema dict."""
    full_doc = inspect.getdoc(func) or ""
    func_description = description or full_doc.split("\n\n")[0].strip() or "Нет описания."

    sig = inspect.signature(func)
    type_hints = get_type_hints(func, include_extras=True)
    param_descriptions = parse_docstring_params(full_doc)

    properties = {}
    required = []

    for param_name, param in sig.parameters.items():
        if param_name in {"self", "cls", "runtime", "ctx", "context"}:
            continue

        annotation = type_hints.get(param_name, Any)
        default = param.default if param.default != inspect.Parameter.empty else ...

        field_description = None
        field_extra: dict[str, Any] = {}

        # Поддержка Annotated[..., Field(...)]
        if get_origin(annotation) is Annotated:
            args = get_args(annotation)
            annotation = args[0]
            for arg in args[1:]:
                if isinstance(arg, FieldInfo):
                    field_description = arg.description
                    if hasattr(arg, "json_schema_extra") and isinstance(
                        arg.json_schema_extra, dict
                    ):
                        field_extra = arg.json_schema_extra
                    break

        if not field_description:
            field_description = param_descriptions.get(param_name)

        # Преобразуем тип в JSON Schema
        json_schema_type = _type_to_json_schema(annotation)

        properties[param_name] = {
            "type": json_schema_type["type"],
            "description": field_description or f"Параметр {param_name}",
            **json_schema_type.get("extra", {}),
            **field_extra,
        }

        if default is ...:
            required.append(param_name)

    # Финальная схема в нужном формате
    tool_schema = {
        "name": name or func.__name__,
        "description": func_description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
        "strict": True,
    }
    return StructuredTool(func=func, args_schema=tool_schema, name=tool_schema["name"])  # type: ignore  # noqa: PGH003


def _type_to_json_schema(annotation: Any) -> dict:
    """Простой конвертер Python-типов → JSON Schema (можно расширять)."""
    if annotation is int:
        return {"type": "integer"}
    if annotation is float:
        return {"type": "number"}
    if annotation is bool:
        return {"type": "boolean"}
    if get_origin(annotation) is list or get_origin(annotation) is list:
        return {"type": "array"}
    # Enum
    if hasattr(annotation, "__members__"):  # Enum
        return {"type": "string", "enum": list(annotation.__members__.keys())}
    return {"type": "string"}  # по умолчанию


def tool(
    name: str | None = None,
    description: str | None = None,
    args_schema: type[BaseModel] | dict | None = None,
):
    def decorator(func: Callable) -> StructuredTool:
        # Явное указание схемы (Pydantic модель или уже готовый dict)
        if args_schema is not None:
            if isinstance(args_schema, dict):
                # Пользователь передал готовую схему
                tool_schema = args_schema
            elif issubclass(args_schema, BaseModel):
                schema_dict = args_schema.model_json_schema()
                tool_schema = {
                    "name": name or func.__name__,
                    "description": description
                    or inspect.getdoc(args_schema)
                    or inspect.getdoc(func)
                    or "",
                    "parameters": {
                        "type": "object",
                        "properties": schema_dict.get("properties", {}),
                        "required": schema_dict.get("required", []),
                        "additionalProperties": False,
                    },
                    "strict": True,
                }
            else:
                raise TypeError("args_schema должен быть наследником BaseModel или dict")

            return StructuredTool(func=func, name=tool_schema["name"], args_schema=tool_schema)

        # Автоматический режим
        return function_to_schema(func, name, description)

    return decorator
