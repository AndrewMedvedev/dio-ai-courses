from __future__ import annotations

from uuid import UUID

from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.orm import Session

from courses.domain.entities.course import Course as DomainCourse
from courses.domain.vo import AttemptStatus, EnrollmentStatus
from courses.infra.models import (
    Block,
    Course,
    Enrollment,
    Lesson,
    LessonCompletion,
    Practice,
    PracticeAttempt,
    PracticeSubmission,
)
from courses.infra.queries import course_query, create_block_nested
from courses.schemas import CourseCreate, CourseListItem, CourseListOut, NestedBlockCreate


class SqlCourseRepository:
    """SQLAlchemy-реализация хранилища курсов."""

    def __init__(self, session: Session) -> None:
        """Инициализация репозитория текущей сессией БД."""

        self.session = session

    def create(self, payload: CourseCreate) -> Course:
        """Создание курса с вложенными блоками из входных данных."""

        domain_course = DomainCourse.create(
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
            created_at=domain_course.created_at,
            updated_at=domain_course.updated_at,
        )
        self.session.add(course)
        self.session.flush()

        for block_data in payload.blocks:
            self.create_block_nested(course.id, block_data)

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

    def get_block(self, course_id: UUID, block_id: UUID) -> Block | None:
        """Получение активного блока по курсу и идентификатору."""

        return self.session.scalar(
            select(Block).where(
                Block.id == block_id,
                Block.course_id == course_id,
                Block.deleted_at.is_(None),
            )
        )

    def get_lesson(self, lesson_id: UUID, course_id: UUID) -> Lesson | None:
        """Получение активного урока в рамках курса."""

        return self.session.scalar(
            select(Lesson)
            .join(Block, Block.id == Lesson.module_id)
            .where(
                Lesson.id == lesson_id,
                Lesson.deleted_at.is_(None),
                Block.course_id == course_id,
                Block.deleted_at.is_(None),
            )
        )

    def create_block_nested(self, course_id: UUID, payload: NestedBlockCreate) -> Block:
        """Создание блока с вложенными уроками и практикой."""

        return create_block_nested(self.session, course_id, payload)

    def max_block_position(self, course_id: UUID) -> int | None:
        """Получение максимальной позиции активного блока курса."""

        return self.session.scalar(
            select(func.max(Block.order)).where(
                Block.course_id == course_id,
                Block.deleted_at.is_(None),
            )
        )

    def max_lesson_position(self, block_id: UUID) -> int | None:
        """Получение максимальной позиции активного урока блока."""

        return self.session.scalar(
            select(func.max(Lesson.position)).where(
                Lesson.module_id == block_id,
                Lesson.deleted_at.is_(None),
            )
        )

    def active_blocks(self, course_id: UUID) -> list[Block]:
        """Получение активных блоков курса в порядке отображения."""

        return list(
            self.session.scalars(
                select(Block)
                .where(Block.course_id == course_id, Block.deleted_at.is_(None))
                .order_by(Block.order)
            ).all()
        )

    def active_lessons(self, block_id: UUID) -> list[Lesson]:
        """Получение активных уроков блока в порядке отображения."""

        return list(
            self.session.scalars(
                select(Lesson)
                .where(Lesson.module_id == block_id, Lesson.deleted_at.is_(None))
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

    def add_enrollment(
        self,
        *,
        user_id: int,
        course_id: UUID,
        current_block_id: UUID | None,
        current_lesson_id: UUID | None,
    ) -> Enrollment:
        """Создание записи прохождения курса."""

        enrollment = Enrollment(
            user_id=user_id,
            course_id=course_id,
            status=EnrollmentStatus.IN_PROGRESS.value,
            current_block_id=current_block_id,
            current_lesson_id=current_lesson_id,
            completion_percent=0,
        )
        self.session.add(enrollment)
        return enrollment

    def get_block_by_id(self, block_id: UUID) -> Block | None:
        """Получение блока по идентификатору."""

        return self.session.scalar(select(Block).where(Block.id == block_id))

    def active_block_lessons(self, block_id: UUID) -> list[Lesson]:
        """Получение активных уроков блока в порядке отображения."""

        return list(
            self.session.scalars(
                select(Lesson)
                .where(Lesson.module_id == block_id, Lesson.deleted_at.is_(None))
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

    def find_in_progress_attempt(
        self, enrollment_id: UUID, practice_id: UUID
    ) -> PracticeAttempt | None:
        """Поиск незавершённой попытки по практике."""

        return self.session.scalar(
            select(PracticeAttempt).where(
                PracticeAttempt.enrollment_id == enrollment_id,
                PracticeAttempt.practice_id == practice_id,
                PracticeAttempt.status == AttemptStatus.IN_PROGRESS.value,
            )
        )

    def count_attempts(self, enrollment_id: UUID, practice_id: UUID) -> int:
        """Подсчёт количества попыток по практике."""

        return self.session.scalar(
            select(func.count(PracticeAttempt.id)).where(
                PracticeAttempt.enrollment_id == enrollment_id,
                PracticeAttempt.practice_id == practice_id,
            )
        ) or 0

    def add_attempt(self, enrollment_id: UUID, practice_id: UUID, attempt_no: int) -> PracticeAttempt:
        """Создание новой попытки выполнения практики."""

        attempt = PracticeAttempt(
            enrollment_id=enrollment_id,
            practice_id=practice_id,
            attempt_no=attempt_no,
            status=AttemptStatus.IN_PROGRESS.value,
        )
        self.session.add(attempt)
        return attempt

    def get_attempt(self, attempt_id: UUID) -> PracticeAttempt | None:
        """Получение попытки выполнения практики."""

        return self.session.scalar(select(PracticeAttempt).where(PracticeAttempt.id == attempt_id))

    def add_submission(
        self,
        *,
        attempt_id: UUID,
        answer_type: str,
        text_answer: str | None,
        code_answer: str | None,
        file_url: str | None,
    ) -> None:
        """Добавление ответа пользователя к попытке практики."""

        self.session.add(
            PracticeSubmission(
                attempt_id=attempt_id,
                answer_type=answer_type,
                text_answer=text_answer,
                code_answer=code_answer,
                file_url=file_url,
            )
        )

    def get_practice(self, practice_id: UUID) -> Practice | None:
        """Получение практического задания по идентификатору."""

        return self.session.scalar(select(Practice).where(Practice.id == practice_id))
