from __future__ import annotations

from datetime import datetime
from uuid import UUID
from uuid import uuid4

from courses.domain.entities import (
    Assignment,
    ContentBlock,
    Course,
    FinalAssessment,
    Lesson,
    Module,
    Practice,
)
from courses.domain.events import (
    CourseArchived,
    CourseCreated,
    CourseDeleted,
    CoursePublished,
    LessonAdded,
    LessonDeleted,
    ModuleAdded,
    ModuleDeleted,
    PracticeAdded,
    PracticeDeleted,
)
from courses.domain.vo import CourseStatus
from shared.utils.time import current_datetime


def active_modules(course: Course) -> list[Module]:
    """Получить активные модули курса без soft-delete записей."""

    return [module for module in course.modules if not module.is_deleted]


def active_lessons(module: Module) -> list[Lesson]:
    """Получить активные уроки модуля без soft-delete записей."""

    return [lesson for lesson in module.lessons if not lesson.is_deleted]


def active_practice(module: Module) -> Practice | None:
    """Получить активную практику модуля, если она есть."""

    if module.practice is None or module.practice.is_deleted:
        return None
    return module.practice


def create_course(
    *,
    title: str,
    description: str,
    difficulty: str,
    tags: list[str],
) -> Course:
    """Создать черновик курса и зарегистрировать доменное событие."""

    now = current_datetime()
    course = Course(
        id=uuid4(),
        title=title,
        description=description,
        difficulty=difficulty,
        tags=tags,
        status=CourseStatus.DRAFT.value,
        popularity=0,
        created_at=now,
        updated_at=now,
    )
    course.register_event(CourseCreated(course_id=course.id, title=course.title))
    return course


def rename_module(module: Module, title: str) -> None:
    """Переименовать модуль."""

    module.title = title


def update_module_description(module: Module, description: str) -> None:
    """Обновить описание модуля."""

    module.description = description


def reorder_module(module: Module, order: int) -> None:
    """Изменить порядок модуля."""

    module.order = order


def append_content_block(module: Module, content_block: ContentBlock) -> None:
    """Добавить контент-блок в модуль."""

    module.content_blocks.append(content_block)


def add_assignment(module: Module, assignment: Assignment) -> None:
    """Добавить задание для закрепления материала в модуль."""

    module.assignment = assignment


def add_lesson_to_module(module: Module, lesson: Lesson, *, course_id: UUID) -> None:
    """Добавить урок в модуль и зарегистрировать доменное событие."""

    module.lessons.append(lesson)
    module.register_event(LessonAdded(course_id=course_id, module_id=module.id, lesson_id=lesson.id))


def attach_practice_to_module(module: Module, practice: Practice, *, course_id: UUID) -> None:
    """Прикрепить практику к модулю и проверить единственность активной практики."""

    if active_practice(module) is not None:
        raise ValueError("Практика уже существует для этого модуля")
    module.practice = practice
    module.register_event(PracticeAdded(course_id=course_id, module_id=module.id, practice_id=practice.id))


def mark_lesson_deleted(lesson: Lesson, deleted_at: datetime) -> None:
    """Пометить урок как удаленный."""

    lesson.deleted_at = deleted_at


def update_lesson_content(lesson: Lesson, content: str) -> None:
    """Обновить содержимое урока."""

    lesson.content = content


def update_practice(
    practice: Practice,
    *,
    task: str,
    criteria: list[str],
    check_type: str,
) -> None:
    """Обновить параметры практического задания."""

    practice.task = task
    practice.criteria = criteria
    practice.check_type = check_type


def mark_practice_deleted(practice: Practice, deleted_at: datetime) -> None:
    """Пометить практическое задание как удаленное."""

    practice.deleted_at = deleted_at


def mark_module_deleted(module: Module, deleted_at: datetime, *, course_id: UUID) -> None:
    """Пометить модуль и активный вложенный контент как удаленные."""

    if module.is_deleted:
        return

    module.deleted_at = deleted_at
    for lesson in active_lessons(module):
        mark_lesson_deleted(lesson, deleted_at)
        module.register_event(LessonDeleted(course_id=course_id, module_id=module.id, lesson_id=lesson.id))

    practice = active_practice(module)
    if practice is not None:
        mark_practice_deleted(practice, deleted_at)
        module.register_event(
            PracticeDeleted(course_id=course_id, module_id=module.id, practice_id=practice.id)
        )

    module.register_event(ModuleDeleted(course_id=course_id, module_id=module.id))


def update_course_details(
    course: Course,
    *,
    title: str | None = None,
    description: str | None = None,
    difficulty: str | None = None,
    tags: list[str] | None = None,
) -> None:
    """Обновить основные поля курса."""

    if title is not None:
        course.title = title
    if description is not None:
        course.description = description
    if difficulty is not None:
        course.difficulty = difficulty
    if tags is not None:
        course.tags = tags


def ensure_can_publish(course: Course) -> None:
    """Проверить, что курс можно опубликовать."""

    modules = active_modules(course)
    if not modules:
        raise ValueError("Нельзя опубликовать курс без модулей")

    for module in modules:
        if not active_lessons(module):
            raise ValueError("Нельзя опубликовать модуль без уроков")


def publish_course(course: Course) -> None:
    """Опубликовать курс после проверки инвариантов."""

    ensure_can_publish(course)
    if course.status != CourseStatus.PUBLISHED.value:
        course.register_event(CoursePublished(course_id=course.id))
    course.status = CourseStatus.PUBLISHED.value


def change_course_status(course: Course, status: str) -> None:
    """Изменить статус курса с проверкой доменных правил."""

    if status not in {item.value for item in CourseStatus}:
        raise ValueError("Некорректный статус курса")

    if status == CourseStatus.PUBLISHED.value:
        publish_course(course)
        return

    if status == CourseStatus.ARCHIVED.value and course.status != status:
        course.register_event(CourseArchived(course_id=course.id))

    course.status = status


def append_module_to_course(course: Course, module: Module) -> None:
    """Добавить модуль в агрегат курса."""

    course.modules.append(module)
    course.register_event(ModuleAdded(course_id=course.id, module_id=module.id))


def add_final_assessment(course: Course, final_assessment: FinalAssessment) -> None:
    """Добавить финальное задание к курсу."""

    course.final_assessment = final_assessment


def mark_course_deleted(course: Course, deleted_at: datetime) -> None:
    """Пометить курс и активный вложенный контент как удалённые."""

    if course.status == CourseStatus.PUBLISHED.value:
        raise ValueError("Нельзя удалить опубликованный курс. Сначала переведите его в архив.")
    if course.is_deleted:
        return

    course.deleted_at = deleted_at
    for module in active_modules(course):
        mark_module_deleted(module, deleted_at, course_id=course.id)
        for event in module.collect_events():
            course.register_event(event)

    course.register_event(CourseDeleted(course_id=course.id))


def assert_reorder_matches_modules(modules: list[Module], ids: list[UUID]) -> None:
    """Проверить, что команда сортировки содержит все ID активных модулей."""

    existing_ids = {module.id for module in modules}
    if set(ids) != existing_ids:
        raise ValueError("Список id должен совпадать со всеми активными модулями")


def assert_reorder_matches_lessons(module: Module, ids: list[UUID]) -> None:
    """ID активных уроков должно быть одинаково."""

    existing_ids = {lesson.id for lesson in active_lessons(module)}
    if set(ids) != existing_ids:
        raise ValueError("Список id должен совпадать со всеми активными уроками")


def first_learning_position(course: Course) -> tuple[UUID | None, UUID | None]:
    """Получить первый активный модуль и урок для записи на курс."""

    modules = sorted(active_modules(course), key=lambda item: item.order)
    if not modules:
        return None, None

    lessons = sorted(active_lessons(modules[0]), key=lambda item: item.position)
    if not lessons:
        return modules[0].id, None

    return modules[0].id, lessons[0].id


def count_learning_units(course: Course) -> tuple[int, int]:
    """Учитывает практику и теории при подсчете успеваемости"""

    lessons_count = 0
    practices_count = 0
    for module in active_modules(course):
        lessons_count += len(active_lessons(module))
        if active_practice(module) is not None:
            practices_count += 1
    return lessons_count, practices_count
