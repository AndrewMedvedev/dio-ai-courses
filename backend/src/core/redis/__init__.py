from uuid import UUID

from ddf.infra.cache.redis import RedisCache
from ddf.infra.cache.redis.serializers.msgpack import MsgpackSerializer
from redis.asyncio import Redis

from ...courses.agents.course_generator.subagents.prompts import (
    CourseStructure,
    LessonStructure,
    ModuleStructure,
)
from ...courses.agents.schemas import Context
from ...courses.domain.entities import Course, Lesson, Module
from ...shared.infra.cache.redis import RedisCheckpointSaver, SavedCheckpoint, SavedWrite
from .config import redis_config

__all__ = ["checkpointer", "redis_client"]

redis_client = Redis(  # ruff: ignore[non-empty-init-module]
    host=redis_config.host,
    port=redis_config.port,
    db=redis_config.db,
    password=redis_config.password,
    decode_responses=False,
)
checkpointer = RedisCheckpointSaver(  # ruff: ignore[non-empty-init-module]
    cache=RedisCache(redis_client, MsgpackSerializer(SavedCheckpoint), ttl=10 * 60 * 60),
    writes_serializer=MsgpackSerializer(SavedWrite),
    state_types={
        "course": Course,
        "module": Module,
        "lesson": Lesson,
        "generation_context": Context,
        "course_structure": CourseStructure,
        "module_structure": ModuleStructure,
        "lesson_structure": LessonStructure,
        "module_id": UUID,
    },
)
