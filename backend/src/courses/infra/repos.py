from __future__ import annotations

from uuid import UUID

from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from courses.domain.services import create_course
from courses.domain.vo import EnrollmentStatus
from courses.infra.models import (
    Course,
    CourseGenerationTask,
    Enrollment,
    GenerationStatus,
    Lesson,
    LessonCompletion,
    Module,
    Practice,
)
from courses.schemas import CourseCreate, CourseListItem, CourseListOut, NestedModuleCreate
from courses.schemas import GenerateCourseRequest


def course_query():
    """Базовый запрос курса с предзагрузкой модулей, уроков и практики."""

    return (
        select(Course)
        .where(Course.deleted_at.is_(None))
        .execution_options(populate_existing=True)
        .options(
            selectinload(Course.modules).selectinload(Module.lessons),
            selectinload(Course.modules).selectinload(Module.practice),
        )
    )


class SqlCourseRepository:
    """SQLAlchemy-реализация хранилища курсов."""

    def __init__(self, session: Session) -> None:
        """Инициализация репозитория текущей сессией БД."""

        self.session = session

    def create(self, payload: CourseCreate) -> Course:
        """Создание курса с вложенными модулями из входных данных."""

        domain_course = create_course(
            title=payload.title,
            description=payload.description,
            difficulty=payload.difficulty,
            tags=payload.tags,
        )
        course = Course(
            id=domain_course.id,
            creator_id=payload.creator_id,
            image_url=payload.image_url,
            title=domain_course.title,
            description=domain_course.description,
            learning_objectives=payload.learning_objectives,
            difficulty=domain_course.difficulty,
            tags=domain_course.tags,
            final_assessment=payload.final_assessment,
            status=domain_course.status,
            popularity=domain_course.popularity,
        )
        self.session.add(course)
        self.session.flush()

        for module_data in payload.modules:
            self.create_module_nested(course.id, module_data)

        return course

    def list(
        self,
        *,
        page: int,
        limit: int,
        status_filter: str | None,
        difficulty: str | None,
        tags: str | None,
        search: str | None,
        sort: str,
    ) -> CourseListOut:
        """Получение страницы курсов с фильтрами, поиском и сортировкой."""

        query = select(Course).where(Course.deleted_at.is_(None))

        filters = []
        if status_filter:
            filters.append(Course.status == status_filter)
        if difficulty:
            filters.append(Course.difficulty == difficulty)
        if search:
            filters.append(
                or_(Course.title.ilike(f"%{search}%"), Course.description.ilike(f"%{search}%"))
            )
        if tags:
            for tag in [item.strip() for item in tags.split(",") if item.strip()]:
                filters.append(Course.tags.cast(String).ilike(f"%\"{tag}\"%"))

        if filters:
            query = query.where(and_(*filters))

        query = self._apply_sort(query, sort)

        total = self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        offset = (page - 1) * limit
        courses = self.session.scalars(query.offset(offset).limit(limit)).all()

        items = [
            CourseListItem(
                id=course.id,
                title=course.title,
                description=course.description,
                difficulty=course.difficulty,
                tags=course.tags or [],
                status=course.status,
                popularity=course.popularity,
                created_at=course.created_at,
            )
            for course in courses
        ]
        next_page = page + 1 if (offset + len(items)) < total else None

        return CourseListOut(items=items, total=total, page=page, limit=limit, next_page=next_page)

    def _apply_sort(self, query, sort: str):
        """Применение сортировки к запросу списка курсов."""

        if sort == "created_at":
            return query.order_by(Course.created_at.asc())
        if sort == "name":
            return query.order_by(Course.title.asc())
        if sort == "-name":
            return query.order_by(Course.title.desc())
        if sort == "popularity":
            return query.order_by(Course.popularity.asc())
        if sort == "-popularity":
            return query.order_by(Course.popularity.desc())
        return query.order_by(Course.created_at.desc())

    def get(self, course_id: UUID) -> Course | None:
        """Получение курса по идентификатору."""

        self.session.expire_all()
        return self.session.scalar(course_query().where(Course.id == course_id))

    def get_module(self, course_id: UUID, module_id: UUID) -> Module | None:
        """Получение активного модуля по курсу и идентификатору."""

        return self.session.scalar(
            select(Module).where(
                Module.id == module_id,
                Module.course_id == course_id,
                Module.deleted_at.is_(None),
            )
        )

    def get_lesson(self, lesson_id: UUID, course_id: UUID) -> Lesson | None:
        """Получение активного урока в рамках курса."""

        return self.session.scalar(
            select(Lesson)
            .join(Module, Module.id == Lesson.module_id)
            .where(
                Lesson.id == lesson_id,
                Lesson.deleted_at.is_(None),
                Module.course_id == course_id,
                Module.deleted_at.is_(None),
            )
        )

    def create_module_nested(self, course_id: UUID, payload: NestedModuleCreate) -> Module:
        """Создание модуля с вложенными уроками и практикой."""

        max_position = self.max_module_order(course_id)
        module = Module(
            course_id=course_id,
            title=payload.title,
            description=payload.description,
            learning_objectives=payload.learning_objectives,
            content_blocks=payload.content_blocks,
            order=(max_position + 1) if max_position is not None else 1,
        )
        self.session.add(module)
        self.session.flush()

        for index, lesson_data in enumerate(payload.lessons, start=1):
            self.session.add(
                Lesson(
                    module_id=module.id,
                    title=lesson_data.title,
                    content=lesson_data.content,
                    learning_objectives=lesson_data.learning_objectives,
                    content_blocks=lesson_data.content_blocks,
                    estimated_time_minutes=lesson_data.estimated_time_minutes,
                    position=index,
                )
            )

        if payload.practice is not None:
            self.session.add(
                Practice(
                    module_id=module.id,
                    task=payload.practice.task,
                    criteria=payload.practice.criteria,
                    check_type=payload.practice.check_type,
                    title=payload.practice.title,
                    assignment_type=payload.practice.assignment_type,
                    assignment_data=payload.practice.assignment_data,
                    passing_score=payload.practice.passing_score,
                )
            )

        return module

    def max_module_order(self, course_id: UUID) -> int | None:
        """Получение максимальной позиции активного модуля курса."""

        return self.session.scalar(
            select(func.max(Module.order)).where(
                Module.course_id == course_id,
                Module.deleted_at.is_(None),
            )
        )

    def max_lesson_position(self, module_id: UUID) -> int | None:
        """Получение максимальной позиции активного урока модуля."""

        return self.session.scalar(
            select(func.max(Lesson.position)).where(
                Lesson.module_id == module_id,
                Lesson.deleted_at.is_(None),
            )
        )

    def active_modules(self, course_id: UUID) -> list[Module]:
        """Получение активных модулей курса в порядке отображения."""

        return list(
            self.session.scalars(
                select(Module)
                .where(Module.course_id == course_id, Module.deleted_at.is_(None))
                .order_by(Module.order)
            ).all()
        )

    def active_lessons(self, module_id: UUID) -> list[Lesson]:
        """Получение активных уроков модуля в порядке отображения."""

        return list(
            self.session.scalars(
                select(Lesson)
                .where(Lesson.module_id == module_id, Lesson.deleted_at.is_(None))
                .order_by(Lesson.position)
            ).all()
        )


class SqlProgressRepository:
    """SQLAlchemy-реализация хранилища прогресса обучения."""

    def __init__(self, session: Session) -> None:
        """Инициализация репозитория текущей сессией БД."""

        self.session = session

    def get_enrollment(self, course_id: UUID, user_id: int) -> Enrollment | None:
        """Получение записи прохождения курса пользователем."""

        return self.session.scalar(
            select(Enrollment).where(Enrollment.course_id == course_id, Enrollment.user_id == user_id)
        )

    def get_enrollment_by_id(self, enrollment_id: UUID) -> Enrollment | None:
        """Получение записи прохождения по идентификатору."""

        return self.session.scalar(select(Enrollment).where(Enrollment.id == enrollment_id))

    def get_course(self, course_id: UUID) -> Course | None:
        """Получение курса по идентификатору."""

        self.session.expire_all()
        return self.session.scalar(course_query().where(Course.id == course_id))

    def get_lesson(self, lesson_id: UUID, course_id: UUID) -> Lesson | None:
        """Получение активного урока в рамках курса."""

        return self.session.scalar(
            select(Lesson)
            .join(Module, Module.id == Lesson.module_id)
            .where(
                Lesson.id == lesson_id,
                Lesson.deleted_at.is_(None),
                Module.course_id == course_id,
                Module.deleted_at.is_(None),
            )
        )

    def add_enrollment(
        self,
        *,
        user_id: int,
        course_id: UUID,
        current_module_id: UUID | None,
        current_lesson_id: UUID | None,
    ) -> Enrollment:
        """Создание записи прохождения курса."""

        enrollment = Enrollment(
            user_id=user_id,
            course_id=course_id,
            status=EnrollmentStatus.IN_PROGRESS.value,
            current_module_id=current_module_id,
            current_lesson_id=current_lesson_id,
            completion_percent=0,
        )
        self.session.add(enrollment)
        return enrollment

    def get_module_by_id(self, module_id: UUID) -> Module | None:
        """Получение модуля по идентификатору."""

        return self.session.scalar(select(Module).where(Module.id == module_id))

    def active_module_lessons(self, module_id: UUID) -> list[Lesson]:
        """Получение активных уроков модуля в порядке отображения."""

        return list(
            self.session.scalars(
                select(Lesson)
                .where(Lesson.module_id == module_id, Lesson.deleted_at.is_(None))
                .order_by(Lesson.position)
            ).all()
        )

    def is_lesson_completed(self, enrollment_id: UUID, lesson_id: UUID) -> bool:
        """Проверка, что урок уже отмечен пройденным."""

        completed = self.session.scalar(
            select(LessonCompletion.id).where(
                LessonCompletion.enrollment_id == enrollment_id,
                LessonCompletion.lesson_id == lesson_id,
            )
        )
        return completed is not None

    def add_lesson_completion(self, enrollment_id: UUID, lesson_id: UUID) -> None:
        """Добавление отметки о прохождении урока."""

        self.session.add(LessonCompletion(enrollment_id=enrollment_id, lesson_id=lesson_id))

    def count_completed_lessons(self, enrollment_id: UUID) -> int:
        """Подсчёт завершённых уроков прохождения курса."""

        return self.session.scalar(
            select(func.count(LessonCompletion.id)).where(LessonCompletion.enrollment_id == enrollment_id)
        ) or 0


class SqlGenerationRepository:
    """SQLAlchemy-реализация хранилища задач генерации курсов."""

    def __init__(self, session: Session) -> None:
        """Инициализация репозитория текущей сессией БД."""

        self.session = session

    def add_task(self, payload: GenerateCourseRequest) -> CourseGenerationTask:
        """Создание задачи генерации курса."""

        task = CourseGenerationTask(
            topic=payload.topic,
            target_audience=payload.target_audience,
            difficulty=payload.difficulty,
            llm_model=payload.llm_model,
            modules_count=payload.modules_count,
            lessons_per_module=payload.lessons_per_module,
            status=GenerationStatus.PENDING.value,
        )
        self.session.add(task)
        return task

    def get_task(self, task_id: UUID) -> CourseGenerationTask | None:
        """Получение задачи генерации курса."""

        return self.session.scalar(select(CourseGenerationTask).where(CourseGenerationTask.id == task_id))
