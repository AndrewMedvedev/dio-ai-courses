from typing import Self

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class RelativePosition(BaseModel):
    """Позиция относительно соседнего размещения; без соседей — в конец коллекции."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    before_id: UUID | None = Field(default=None, description="Разместить перед этим размещением")
    after_id: UUID | None = Field(default=None, description="Разместить после этого размещения")

    @model_validator(mode="after")
    def _single_anchor(self) -> Self:
        if self.before_id is not None and self.after_id is not None:
            raise ValueError("Only one of beforeId or afterId can be provided.")
        return self
