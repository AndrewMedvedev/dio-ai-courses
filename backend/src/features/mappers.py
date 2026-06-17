from features.domain.entities import (
    Course as DomainCourse,
    Lesson as DomainLesson,
    Module as DomainModule,
    Practice as DomainPractice,
)
from features.domain.services import active_lessons, active_modules, active_practice
from courses.infra.mappers import (
    assignment_to_json,
    content_blocks_to_json,
    final_assessment_to_json,
    map_course_to_domain,
)
from features.schemas import CourseOut, LessonOut, ModuleOut, PracticeOut, ProgressOut
from features.schemas import GenerationTaskOut


def map_lesson_to_response(lesson: DomainLesson) -> LessonOut:
    """Преобразование доменного урока в ответ API."""

    return LessonOut(
        id=lesson.id,
        title=lesson.title,
        content=lesson.content,
        position=lesson.position,
        learning_objectives=lesson.learning_objectives,
        content_blocks=content_blocks_to_json(lesson.content_blocks),
        estimated_time_minutes=lesson.estimated_time_minutes,
    )


def map_practice_to_response(practice: DomainPractice) -> PracticeOut:
    """Преобразование доменной практики в ответ API."""

    return PracticeOut(
        id=practice.id,
        task=practice.task,
        criteria=practice.criteria,
        check_type=practice.check_type,
        title=practice.title,
        assignment_type=practice.assignment_type,
        assignment_data=assignment_to_json(practice.assignment_data),
        passing_score=practice.passing_score,
    )


def map_module_to_response(module: DomainModule) -> ModuleOut:
    """Преобразование доменного модуля в ответ API."""

    practice = active_practice(module)
    return ModuleOut(
        id=module.id,
        title=module.title,
        description=module.description,
        position=module.order,
        learning_objectives=module.learning_objectives,
        content_blocks=content_blocks_to_json(module.content_blocks),
        lessons=[
            map_lesson_to_response(lesson)
            for lesson in sorted(active_lessons(module), key=lambda item: item.position)
        ],
        practice=None if practice is None else map_practice_to_response(practice),
    )


def map_course_to_response(course: DomainCourse) -> CourseOut:
    """Преобразование доменного курса в полный ответ API."""

    return CourseOut(
        id=course.id,
        title=course.title,
        description=course.description,
        difficulty=course.difficulty,
        creator_id=course.creator_id,
        image_url=course.image_url,
        learning_objectives=course.learning_objectives,
        tags=course.tags,
        final_assessment=final_assessment_to_json(course.final_assessment),
        status=course.status,
        popularity=course.popularity,
        created_at=course.created_at,
        updated_at=course.updated_at,
        modules=[
            map_module_to_response(module)
            for module in sorted(active_modules(course), key=lambda item: item.order)
        ],
    )


def map_course_model_to_response(course) -> CourseOut:
    """Преобразование ORM-курса в полный ответ API."""

    return map_course_to_response(map_course_to_domain(course))


def map_enrollment_to_response(enrollment) -> ProgressOut:
    """Преобразование прохождения курса в ответ API."""

    return ProgressOut(
        enrollment_id=enrollment.id,
        user_id=enrollment.user_id,
        course_id=enrollment.course_id,
        status=enrollment.status,
        current_module_id=enrollment.current_module_id,
        current_lesson_id=enrollment.current_lesson_id,
        completion_percent=round(enrollment.completion_percent, 2),
        started_at=enrollment.started_at,
        completed_at=enrollment.completed_at,
    )


def map_generation_task_to_response(task) -> GenerationTaskOut:
    """Преобразование задачи генерации в ответ API."""

    return GenerationTaskOut(
        id=task.id,
        status=task.status,
        topic=task.topic,
        target_audience=task.target_audience,
        difficulty=task.difficulty,
        llm_model=task.llm_model,
        modules_count=task.modules_count,
        lessons_per_module=task.lessons_per_module,
        course_id=task.course_id,
        error_message=task.error_message,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )
