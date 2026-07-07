from collections.abc import Callable
from dataclasses import dataclass

from openai.types.responses import FunctionToolParam


@dataclass
class StructuredTool:
    func: Callable
    name: str
    runtime: bool
    args_schema: dict

    def to_tool_param(self) -> FunctionToolParam:
        return FunctionToolParam(type="function", **self.args_schema)  # type: ignore  # noqa: PGH003
