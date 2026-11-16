from typing import cast

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.redis.jsonplus_redis import JsonPlusRedisSerializer

from src.core.database import checkpointer as base_checkpointer

serializer = JsonPlusRedisSerializer(
    allowed_json_modules=[
        (
            "src",
            "courses",
            "agents",
            "schemas",
            "Context",
        ),
        ("src", "courses", "agents", "schemas", "GenerationContext"),
        # Keep legacy model paths for persisted generation checkpoints.
        (
            "src",
            "courses",
            "agents",
            "course_generator",
            "subagents",
            "prompts",
            "CourseStructure",
        ),
        (
            "src",
            "courses",
            "agents",
            "course_generator",
            "subagents",
            "prompts",
            "ModuleStructure",
        ),
        (
            "src",
            "courses",
            "agents",
            "course_generator",
            "subagents",
            "prompts",
            "LessonStructure",
        ),
        (
            "src",
            "courses",
            "agents",
            "course_generator",
            "subagents",
            "prompts",
            "ContentSpecification",
        ),
        (
            "src",
            "courses",
            "ai",
            "prompts",
            "models",
            "CourseStructure",
        ),
        (
            "src",
            "courses",
            "ai",
            "prompts",
            "models",
            "ModuleStructure",
        ),
        (
            "src",
            "courses",
            "ai",
            "prompts",
            "models",
            "LessonStructure",
        ),
        (
            "src",
            "courses",
            "ai",
            "prompts",
            "models",
            "ContentSpecification",
        ),
    ],
    allowed_msgpack_modules=[
        (
            "src.courses.agents.schemas",
            "Context",
        ),
        ("src.courses.agents.schemas", "GenerationContext"),
        (
            "src.courses.agents.course_generator.subagents.prompts",
            "CourseStructure",
        ),
        (
            "src.courses.agents.course_generator.subagents.prompts",
            "ModuleStructure",
        ),
        (
            "src.courses.agents.course_generator.subagents.prompts",
            "LessonStructure",
        ),
        (
            "src.courses.ai.prompts.models",
            "CourseStructure",
        ),
        (
            "src.courses.ai.prompts.models",
            "ModuleStructure",
        ),
        (
            "src.courses.ai.prompts.models",
            "LessonStructure",
        ),
        (
            "builtins",
            "ExceptionGroup",
        ),
        (
            "builtins",
            "BaseExceptionGroup",
        ),
    ],
)


checkpointer = cast(
    AsyncPostgresSaver,
    base_checkpointer,
)

checkpointer.serde = serializer
