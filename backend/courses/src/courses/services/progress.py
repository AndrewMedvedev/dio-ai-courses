from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.courses.domain.exceptions import (
    AttemptNotFoundError,
    BlockNotFoundError,
    CourseValidationError,
    EnrollmentNotFoundError,
    PracticeNotFoundError,
)
from src.courses.domain.repos import ProgressRepository
from src.courses.infra.models import (
    AttemptStatus,
    CourseStatus,
    Enrollment,
    EnrollmentStatus,
    LessonCompletion,
    PracticeAttempt,
)
from src.courses.infra.queries import (
    active_blocks,
    active_lessons,
    active_practice,
    must_get_block,
    must_get_course,
    must_get_lesson,
)
from src.courses.schemas import (
    AttemptOut,
    CompleteLessonRequest,
    EnrollRequest,
    ProgressOut,
    ReviewAttemptRequest,
    StartAttemptRequest,
    SubmitAttemptRequest,
    attempt_out_from_orm,
)


class ProgressService:
    """Сервис пользовательских сценариев прохождения курсов."""

    def __init__(self, session: Session, repository: ProgressRepository) -> None:
        """Инициализация сервиса с сессией БД и репозиторием прогресса."""

        self.session = session
        self.repository = repository

    def enroll(self, course_id: str, payload: EnrollRequest) -> ProgressOut:
        """Запись пользователя на опубликованный курс."""

        course = must_get_course(self.session, course_id)
        if course.status != CourseStatus.PUBLISHED.value:
            raise CourseValidationError("Only published courses are available for enrollment")

        existing = self.repository.get_enrollment(course_id, payload.user_id)
        if existing is not None:
            return progress_payload(existing)

        first_block_id, first_lesson_id = find_first_lesson(course)
        enrollment = self.repository.add_enrollment(
            user_id=payload.user_id,
            course_id=course_id,
            current_block_id=first_block_id,
            current_lesson_id=first_lesson_id,
        )
        self.session.commit()
        self.session.refresh(enrollment)
        return progress_payload(enrollment)

    def get_progress(self, course_id: str, user_id: int) -> ProgressOut:
        """Получение прогресса пользователя по курсу."""

        must_get_course(self.session, course_id)
        enrollment = self.repository.get_enrollment(course_id, user_id)
        if enrollment is None:
            raise EnrollmentNotFoundError()
        return progress_payload(enrollment)

    def complete_lesson(
        self,
        course_id: str,
        lesson_id: str,
        payload: CompleteLessonRequest,
    ) -> ProgressOut:
        """Отметка урока пройденным и продвижение пользователя по курсу."""

        course = must_get_course(self.session, course_id)
        lesson = must_get_lesson(self.session, lesson_id, course_id)
        block = self.repository.get_block_by_id(lesson.block_id)
        if block is None:
            raise BlockNotFoundError()

        enrollment = self.repository.get_enrollment(course_id, payload.user_id)
        if enrollment is None:
            raise EnrollmentNotFoundError()

        if enrollment.status == EnrollmentStatus.COMPLETED.value:
            return progress_payload(enrollment)

        if (
            enrollment.current_lesson_id
            and enrollment.current_lesson_id != lesson_id
            and not self.repository.is_lesson_completed(enrollment.id, lesson_id)
        ):
            raise CourseValidationError("Lesson is locked by navigation rules")

        if not self.repository.is_lesson_completed(enrollment.id, lesson_id):
            self.repository.add_lesson_completion(enrollment.id, lesson_id)
            self.session.flush()

        block_lessons = self.repository.active_block_lessons(block.id)
        lesson_ids = [item.id for item in block_lessons]
        current_index = lesson_ids.index(lesson_id)

        next_lesson_id = (
            lesson_ids[current_index + 1]
            if current_index + 1 < len(lesson_ids)
            else None
        )
        if next_lesson_id is not None:
            enrollment.current_block_id = block.id
            enrollment.current_lesson_id = next_lesson_id
        else:
            practice = active_practice(block)
            if (
                practice is not None
                and not is_block_practice_passed(self.session, enrollment.id, practice.id)
            ):
                enrollment.current_block_id = block.id
                enrollment.current_lesson_id = None
            else:
                advance_after_practice(enrollment, course, block.id)

        recalculate_progress(self.session, enrollment, course)
        self.session.commit()
        self.session.refresh(enrollment)
        return progress_payload(enrollment)

    def start_practice_attempt(
        self,
        course_id: str,
        block_id: str,
        payload: StartAttemptRequest,
    ) -> AttemptOut:
        """Создание или получение активной попытки выполнения практики."""

        must_get_course(self.session, course_id)
        block = must_get_block(self.session, course_id, block_id)
        practice = active_practice(block)
        if practice is None:
            raise PracticeNotFoundError()

        enrollment = self.repository.get_enrollment(course_id, payload.user_id)
        if enrollment is None:
            raise EnrollmentNotFoundError()

        for item in active_lessons(block):
            if not self.repository.is_lesson_completed(enrollment.id, item.id):
                raise CourseValidationError("Practice is locked until all lessons in block are completed")

        in_progress = self.repository.find_in_progress_attempt(enrollment.id, practice.id)
        if in_progress is not None:
            return attempt_out_from_orm(in_progress)

        attempts_count = self.repository.count_attempts(enrollment.id, practice.id)
        attempt = self.repository.add_attempt(enrollment.id, practice.id, attempts_count + 1)
        self.session.commit()
        self.session.refresh(attempt)
        return attempt_out_from_orm(attempt)

    def submit_practice_attempt(
        self,
        attempt_id: str,
        payload: SubmitAttemptRequest,
    ) -> AttemptOut:
        """Добавление ответа пользователя к попытке практики."""

        attempt = self.repository.get_attempt(attempt_id)
        if attempt is None:
            raise AttemptNotFoundError()
        if attempt.status != AttemptStatus.IN_PROGRESS.value:
            raise CourseValidationError("Only in_progress attempt can receive submission")

        self.repository.add_submission(
            attempt_id=attempt.id,
            answer_type=payload.answer_type,
            text_answer=payload.text_answer,
            code_answer=payload.code_answer,
            file_url=payload.file_url,
        )
        self.session.commit()
        self.session.refresh(attempt)
        return attempt_out_from_orm(attempt)

    def review_practice_attempt(
        self,
        attempt_id: str,
        payload: ReviewAttemptRequest,
    ) -> ProgressOut:
        """Проверка попытки практики и пересчёт прогресса."""

        attempt = self.repository.get_attempt(attempt_id)
        if attempt is None:
            raise AttemptNotFoundError()
        if attempt.status != AttemptStatus.IN_PROGRESS.value:
            raise CourseValidationError("Attempt already reviewed")

        attempt.status = AttemptStatus.PASSED.value if payload.passed else AttemptStatus.FAILED.value
        attempt.score = payload.score
        attempt.feedback = payload.feedback
        attempt.checked_at = datetime.utcnow()

        enrollment = self.repository.get_enrollment_by_id(attempt.enrollment_id)
        if enrollment is None:
            raise EnrollmentNotFoundError()

        course = must_get_course(self.session, enrollment.course_id)
        if payload.passed:
            practice = self.repository.get_practice(attempt.practice_id)
            if practice is not None:
                block = self.repository.get_block_by_id(practice.block_id)
                if block is not None:
                    advance_after_practice(enrollment, course, block.id)

        self.session.flush()
        recalculate_progress(self.session, enrollment, course)
        self.session.commit()
        self.session.refresh(enrollment)
        return progress_payload(enrollment)


def progress_payload(enrollment: Enrollment) -> ProgressOut:
    """Сериализация прохождения курса в ответ API."""

    return ProgressOut(
        enrollment_id=enrollment.id,
        user_id=enrollment.user_id,
        course_id=enrollment.course_id,
        status=enrollment.status,
        current_block_id=enrollment.current_block_id,
        current_lesson_id=enrollment.current_lesson_id,
        completion_percent=round(enrollment.completion_percent, 2),
        started_at=enrollment.started_at,
        completed_at=enrollment.completed_at,
    )


def find_first_lesson(course) -> tuple[str | None, str | None]:
    """Поиск первого доступного блока и урока курса."""

    blocks = sorted(active_blocks(course), key=lambda item: item.position)
    if not blocks:
        return None, None
    first_block = blocks[0]
    lessons = sorted(active_lessons(first_block), key=lambda item: item.position)
    if not lessons:
        return first_block.id, None
    return first_block.id, lessons[0].id


def count_course_units(course) -> tuple[int, int]:
    """Подсчёт общего количества уроков и практик курса."""

    lessons_count = 0
    practices_count = 0
    for block in active_blocks(course):
        lessons_count += len(active_lessons(block))
        if active_practice(block) is not None:
            practices_count += 1
    return lessons_count, practices_count


def recalculate_progress(db: Session, enrollment: Enrollment, course) -> None:
    """Пересчёт процента прохождения курса."""

    total_lessons, total_practices = count_course_units(course)
    total_units = total_lessons + total_practices

    completed_lessons = db.scalar(
        select(func.count(LessonCompletion.id)).where(LessonCompletion.enrollment_id == enrollment.id)
    ) or 0
    completed_practices = db.scalar(
        select(func.count(PracticeAttempt.id)).where(
            PracticeAttempt.enrollment_id == enrollment.id,
            PracticeAttempt.status == AttemptStatus.PASSED.value,
        )
    ) or 0

    if total_units == 0:
        enrollment.completion_percent = 0.0
    else:
        enrollment.completion_percent = ((completed_lessons + completed_practices) / total_units) * 100


def is_block_practice_passed(db: Session, enrollment_id: str, practice_id: str) -> bool:
    """Проверка, что практика блока успешно пройдена."""

    passed = db.scalar(
        select(PracticeAttempt.id).where(
            PracticeAttempt.enrollment_id == enrollment_id,
            PracticeAttempt.practice_id == practice_id,
            PracticeAttempt.status == AttemptStatus.PASSED.value,
        )
    )
    return passed is not None


def advance_after_practice(enrollment: Enrollment, course, current_block_id: str) -> None:
    """Продвижение пользователя к следующему блоку после практики."""

    blocks = sorted(active_blocks(course), key=lambda item: item.position)
    current_index = next((index for index, block in enumerate(blocks) if block.id == current_block_id), None)
    if current_index is None:
        return

    if current_index + 1 < len(blocks):
        next_block = blocks[current_index + 1]
        next_lessons = sorted(active_lessons(next_block), key=lambda item: item.position)
        enrollment.current_block_id = next_block.id
        enrollment.current_lesson_id = next_lessons[0].id if next_lessons else None
    else:
        enrollment.current_block_id = None
        enrollment.current_lesson_id = None
        enrollment.status = EnrollmentStatus.COMPLETED.value
        enrollment.completed_at = datetime.utcnow()
