# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


import logging
from dataclasses import asdict

from ...shared.infra.repos import ModelMapper
from ..domain.entities import (
    BasicInfo,
    Chat,
    Course,
    CourseBasicInfo,
    Document,
    Lesson,
    LessonBasicInfo,
    Module,
    ModuleBasicInfo,
)
from .models import ChatOrm, CourseOrm, DocumentOrm, LessonOrm, ModuleOrm

logger = logging.getLogger(__name__)


class ChatMapper(ModelMapper[Chat, ChatOrm]):
    @staticmethod
    def to_entity(model: ChatOrm) -> Chat:
        return Chat(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            user_id=model.user_id,
            course_id=model.course_id,
            messages=model.messages,
        )

    @staticmethod
    def from_entity(entity: Chat) -> ChatOrm:
        return ChatOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            user_id=entity.user_id,
            course_id=entity.course_id,
            messages=entity.messages,
        )


class LessonMapper(ModelMapper[Lesson, LessonOrm]):
    @staticmethod
    def to_entity(model: LessonOrm) -> Lesson:
        return Lesson(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            module_id=model.module_id,
            title=model.title,
            description=model.description,
            order=model.order,
            learning_objectives=model.learning_objectives,
            content_blocks=model.content_blocks,
            estimated_time_minutes=model.estimated_time_minutes,
            assignment=model.assignment,
        )

    @staticmethod
    def from_entity(entity: Lesson) -> LessonOrm:
        return LessonOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            module_id=entity.module_id,
            title=entity.title,
            description=entity.description,
            order=entity.order,
            learning_objectives=entity.learning_objectives,
            content_blocks=entity.content_blocks,
            estimated_time_minutes=entity.estimated_time_minutes,
            assignment=asdict(entity.assignment) if entity.assignment else None,
            # module_id не передаём — проставляется через assign_module
        )

    @staticmethod
    def basic_info_mapper(row: tuple) -> LessonBasicInfo:
        return LessonBasicInfo(
            id=row.id,
            title=row.title,
            description=row.description,
            order=row.order,
            learning_objectives=row.learning_objectives,
            estimated_time_minutes=row.estimated_time_minutes,
        )


class ModuleMapper(ModelMapper[Module, ModuleOrm]):
    @staticmethod
    def to_entity(model: ModuleOrm) -> Module:
        return Module(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            course_id=model.course_id,
            title=model.title,
            description=model.description,
            order=model.order,
            learning_objectives=model.learning_objectives,
            assignment=model.assignment,
            lessons=[LessonMapper.to_entity(lesson) for lesson in model.lessons],
        )

    @staticmethod
    def from_entity(entity: Module) -> ModuleOrm:
        return ModuleOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            course_id=entity.course_id,
            title=entity.title,
            description=entity.description,
            order=entity.order,
            learning_objectives=entity.learning_objectives,
            assignment=entity.assignment,
        )

    @staticmethod
    def basic_info_mapper(row: tuple, lessons: list[BasicInfo]) -> ModuleBasicInfo:
        return ModuleBasicInfo(
            id=row.id,
            title=row.title,
            description=row.description,
            order=row.order,
            learning_objectives=row.learning_objectives,
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
            assignment=model.assignment,
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
            assignment=entity.assignment,
        )

    @staticmethod
    def basic_info_mapper(row: tuple, modules: list[BasicInfo]) -> CourseBasicInfo:
        return CourseBasicInfo(
            id=row.id,
            title=row.title,
            description=row.description,
            difficulty=row.difficulty,
            tags=row.tags,
            learning_objectives=row.learning_objectives,
            modules=modules,
        )


class DocumentMapper(ModelMapper[Document, DocumentOrm]):
    @staticmethod
    def to_entity(model: DocumentOrm) -> Document:
        return Document(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            owner_id=model.owner_id,
            parent_node_id=model.parent_node_id,
            node_type=model.node_type,
            title=model.title,
            content=model.content,
        )

    @staticmethod
    def from_entity(entity: Document) -> DocumentOrm:
        return DocumentOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            owner_id=entity.owner_id,
            parent_node_id=entity.parent_node_id,
            node_type=entity.node_type,
            title=entity.title,
            content=entity.content,
        )
