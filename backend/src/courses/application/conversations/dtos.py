from typing import Any, Literal

from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.courses.application.catalog.dtos import RelativePosition
from src.courses.domain.catalog.enums import ContentType


class ChatDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    chat_id: UUID = Field(default_factory=uuid4)
    role: Literal["assistant", "user"] = "user"
    content: str | dict[str, Any]


class ModuleGenerationChatDTO(ChatDTO):
    position: RelativePosition = Field(default_factory=RelativePosition)


class LessonGenerationChatDTO(ModuleGenerationChatDTO):
    module_id: UUID


class EditorChatDTO(ChatDTO):
    content_type: ContentType
    content_block: str
    content_blocks: list
    images: list[str] = Field(default_factory=list, max_length=5)


class MentorChatDTO(ChatDTO):
    content_blocks: list = Field(default_factory=list)
