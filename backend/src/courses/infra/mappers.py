import logging

from ...shared.infra.repos import ModelMapper
from ..domain.entities import (
    BasicInfo,
    Course,
    CourseBasicInfo,
    Lesson,
    LessonBasicInfo,
    Module,
    ModuleBasicInfo,
)
from .models import CourseOrm, LessonOrm, ModuleOrm

logger = logging.getLogger(__name__)


class LessonMapper(ModelMapper[Lesson, LessonOrm]):
    @staticmethod
    def to_entity(model: LessonOrm) -> Lesson:
        return Lesson(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            title=model.title,
            description=model.description,
            order=model.order,  # type: ignore  # noqa: PGH003
            learning_objectives=model.learning_objectives,
            content_blocks=model.content_blocks,  # type: ignore  # noqa: PGH003
            estimated_time_minutes=model.estimated_time_minutes,
            assignment=model.assignment,  # type: ignore  # noqa: PGH003
        )

    @staticmethod
    def from_entity(entity: Lesson) -> LessonOrm:
        return LessonOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            title=entity.title,
            description=entity.description,
            order=entity.order,
            learning_objectives=entity.learning_objectives,
            content_blocks=entity.content_blocks,
            estimated_time_minutes=entity.estimated_time_minutes,
            assignment=entity.assignment,
            # module_id не передаём — проставляется через assign_module
        )

    @staticmethod
    def basic_info_mapper(row: tuple) -> LessonBasicInfo:
        return LessonBasicInfo(
            id=row.id,  # type: ignore  # noqa: PGH003
            title=row.title,  # type: ignore  # noqa: PGH003
            description=row.description,  # type: ignore  # noqa: PGH003
            order=row.order,  # type: ignore  # noqa: PGH003
            learning_objectives=row.learning_objectives,  # type: ignore  # noqa: PGH003
            estimated_time_minutes=row.estimated_time_minutes,  # type: ignore  # noqa: PGH003
        )


class ModuleMapper(ModelMapper[Module, ModuleOrm]):
    @staticmethod
    def to_entity(model: ModuleOrm) -> Module:
        return Module(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            title=model.title,
            description=model.description,
            order=model.order,  # type: ignore  # noqa: PGH003
            learning_objectives=model.learning_objectives,
            assignment=model.assignment,  # type: ignore  # noqa: PGH003
            # маппим каждый LessonOrm в доменный Lesson
            lessons=[LessonMapper.to_entity(lesson) for lesson in model.lessons],
        )

    @staticmethod
    def from_entity(entity: Module) -> ModuleOrm:
        return ModuleOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            title=entity.title,
            description=entity.description,
            order=entity.order,
            learning_objectives=entity.learning_objectives,
            assignment=entity.assignment,
        )

    @staticmethod
    def basic_info_mapper(row: tuple, lessons: list[BasicInfo]) -> ModuleBasicInfo:
        return ModuleBasicInfo(
            id=row.id,  # type: ignore  # noqa: PGH003
            title=row.title,  # type: ignore  # noqa: PGH003
            description=row.description,  # type: ignore  # noqa: PGH003
            order=row.order,  # type: ignore  # noqa: PGH003
            learning_objectives=row.learning_objectives,  # type: ignore  # noqa: PGH003
            lessons=lessons,
        )


class CourseMapper(ModelMapper[Course, CourseOrm]):
    @staticmethod
    def to_entity(model: CourseOrm) -> Course:
        return Course(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            title=model.title,
            description=model.description,
            difficulty=model.difficulty,
            tags=model.tags,
            status=model.status,
            popularity=model.popularity,
            creator_id=model.creator_id,
            image_url=model.image_url,
            learning_objectives=model.learning_objectives,
            final_assessment=model.final_assessment,  # type: ignore  # noqa: PGH003
            # маппим каждый ModuleOrm в доменный Module
            modules=[ModuleMapper.to_entity(module) for module in model.modules],
        )

    @staticmethod
    def from_entity(entity: Course) -> CourseOrm:
        return CourseOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            title=entity.title,
            description=entity.description,
            difficulty=entity.difficulty,
            tags=entity.tags,
            status=entity.status,
            popularity=entity.popularity,
            creator_id=entity.creator_id,
            image_url=entity.image_url,
            learning_objectives=entity.learning_objectives,
            final_assessment=entity.final_assessment,
            # modules не передаём — модули уже в БД,
            # course_id им проставит assign_course
        )

    @staticmethod
    def basic_info_mapper(row: tuple, modules: list[BasicInfo]) -> CourseBasicInfo:
        return CourseBasicInfo(
            id=row.id,  # type: ignore  # noqa: PGH003
            title=row.title,  # type: ignore  # noqa: PGH003
            description=row.description,  # type: ignore  # noqa: PGH003
            difficulty=row.difficulty,  # type: ignore  # noqa: PGH003
            tags=row.tags,  # type: ignore  # noqa: PGH003
            learning_objectives=row.learning_objectives,  # type: ignore  # noqa: PGH003
            modules=modules,
        )
