# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


import logging

from src.shared.infra.database.mappers import ModelMapper

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
    Practice,
)
from .models import ChatOrm, CourseOrm, DocumentOrm, LessonOrm, ModuleOrm, PracticeOrm

logger = logging.getLogger(__name__)


class ChatMapper(ModelMapper[Chat, ChatOrm]):
    @staticmethod
    def from_model(model: ChatOrm) -> Chat:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
        return Chat(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            user_id=model.user_id,
            course_id=model.course_id,
            messages=model.messages,
        )

    @staticmethod
    def to_model(entity: Chat) -> ChatOrm:
        """Создаёт объект из доменную сущность, чтобы восстановить доменную модель из внешнего формата."""
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
    def from_model(model: LessonOrm) -> Lesson:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
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
        )

    @staticmethod
    def to_model(entity: Lesson) -> LessonOrm:
        """Создаёт объект из доменную сущность, чтобы восстановить доменную модель из внешнего формата."""
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
        )

    @staticmethod
    def basic_info_mapper(row: tuple) -> LessonBasicInfo:
        """Преобразует данные в `basic_info_mapper`, чтобы разделить доменную модель и модель хранения."""
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
    def from_model(model: ModuleOrm) -> Module:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
        return Module(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            course_id=model.course_id,
            title=model.title,
            description=model.description,
            order=model.order,
            learning_objectives=model.learning_objectives,
        )

    @staticmethod
    def to_model(entity: Module) -> ModuleOrm:
        """Создаёт объект из доменную сущность, чтобы восстановить доменную модель из внешнего формата."""
        return ModuleOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            course_id=entity.course_id,
            title=entity.title,
            description=entity.description,
            order=entity.order,
            learning_objectives=entity.learning_objectives,
        )

    @staticmethod
    def basic_info_mapper(row: tuple, lessons: list[BasicInfo]) -> ModuleBasicInfo:
        """Преобразует данные в `basic_info_mapper`, чтобы разделить доменную модель и модель хранения."""
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
    def from_model(model: CourseOrm) -> Course:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
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
        )

    @staticmethod
    def to_model(entity: Course) -> CourseOrm:
        """Создаёт объект из доменную сущность, чтобы восстановить доменную модель из внешнего формата."""
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
        )

    @staticmethod
    def basic_info_mapper(row: tuple, modules: list[BasicInfo]) -> CourseBasicInfo:
        """Преобразует данные в `basic_info_mapper`, чтобы разделить доменную модель и модель хранения."""
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
    def from_model(model: DocumentOrm) -> Document:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
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
    def to_model(entity: Document) -> DocumentOrm:
        """Создаёт объект из доменную сущность, чтобы восстановить доменную модель из внешнего формата."""
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


class PracticeMapper(ModelMapper[Practice, PracticeOrm]):
    @staticmethod
    def from_model(model: PracticeOrm) -> Practice:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
        return Practice(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            user_id=model.user_id,
            module_id=model.module_id,
            lesson_id=model.lesson_id,
            status=model.status,
            practice=model.practice,
        )

    @staticmethod
    def to_model(entity: Practice) -> PracticeOrm:
        """Создаёт объект из доменную сущность, чтобы восстановить доменную модель из внешнего формата."""
        return PracticeOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            user_id=entity.user_id,
            module_id=entity.module_id,
            lesson_id=entity.lesson_id,
            status=entity.status,
            practice=entity.practice,
        )
