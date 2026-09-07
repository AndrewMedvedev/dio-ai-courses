from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.database import session_factory
from src.core.settings import settings

from ...application.services.progress import LearningProgressService
from ...domain.events import PracticePassed, TestPassed
from ..database.repos.course import SqlCourseRepository
from ..database.repos.course_progress import SqlCourseProgressRepository
from ..database.repos.lesson import SqlLessonRepository
from ..database.repos.lesson_progress import SqlLessonProgressRepository
from ..database.repos.module import SqlModuleRepository
from ..database.repos.module_progress import SqlModuleProgressRepository
from ..database.repos.student import SqlStudentRepository

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
practice_queue = RabbitQueue(
    "learning_progress", durable=True, routing_key=PracticePassed.event_type
)
test_queue = RabbitQueue("learning_progress", durable=True, routing_key=TestPassed.event_type)


async def update_progress(event: PracticePassed | TestPassed) -> None:
    async with session_factory() as session:
        service = LearningProgressService(
            progress_repo=SqlLessonProgressRepository(session),
            course_progress_repo=SqlCourseProgressRepository(session),
            course_repo=SqlCourseRepository(session),
            module_repo=SqlModuleRepository(session),
            module_progress_repo=SqlModuleProgressRepository(session),
            lesson_repo=SqlLessonRepository(session),
            student_repo=SqlStudentRepository(session),
            uow=session,
        )
        await service.mark_assessment_completed(event)


@rabbit_router.subscriber(practice_queue, exchange)
async def on_practice_passed(event: PracticePassed) -> None:
    await update_progress(event)


@rabbit_router.subscriber(test_queue, exchange)
async def on_test_passed(event: TestPassed) -> None:
    await update_progress(event)
