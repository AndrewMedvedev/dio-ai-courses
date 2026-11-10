from typing import Annotated

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.repos import TheorySessionRepoDep, get_lesson_repo
from src.courses.application.learning.dtos.theory_session import (
    LessonTheorySessionFilters,
    LessonTheorySessionResponse,
    UpdateLessonTheorySessionDTO,
)
from src.courses.domain.learning.entities import (
    LessonTheorySession,
)
from src.courses.domain.permissions.courses import READ as READ_COURSE
from src.courses.domain.permissions.theory_session import READ
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.dependencies import DBSession
from src.shared.domain.exceptions import ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/theory-sessions", tags=["Theory Sessions"])


@router.post(
    "/{uid}",
    summary="Создать сессию изучения теории",
    description="Создаёт сессию изучения теории для текущего пользователя и указанного урока.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(READ_COURSE, get_lesson_repo))],
)
async def create(
    identity: CurrentIdentity,
    repo: TheorySessionRepoDep,
    session: DBSession,
    uid: UUID,
) -> LessonTheorySessionResponse:
    result = await repo.create(LessonTheorySession(lesson_id=uid, user_id=identity.id))
    await session.commit()
    return LessonTheorySessionResponse.model_validate(result)


@router.patch(
    "/{theory_session_id}",
    summary="Обновить сессию изучения теории",
    description="Сохраняет переданные метрики сессии: активное время, глубину прокрутки и время завершения.",
    status_code=status.HTTP_200_OK,
)
async def update(
    identity: CurrentIdentity,
    repo: TheorySessionRepoDep,
    session: DBSession,
    theory_session_id: UUID,
    dto: UpdateLessonTheorySessionDTO,
) -> LessonTheorySessionResponse:
    theory_session = await repo.read(uid=theory_session_id)
    if not theory_session:
        raise NotFoundError
    if theory_session.user_id != identity.id:
        raise ForbiddenError
    theory_session.edit(**dto.model_dump(exclude_none=True))
    await repo.update(theory_session)
    await session.commit()
    return LessonTheorySessionResponse.model_validate(theory_session)


@router.get(
    "/{uid}/users/{user_id}",
    summary="Получить сессии изучения теории пользователя",
    description="Возвращает историю сессий изучения указанного урока выбранным пользователем с учётом фильтров по дате.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(READ, get_lesson_repo))],
)
async def get(
    user_id: UUID,
    repo: TheorySessionRepoDep,
    uid: UUID,
    filters: Annotated[LessonTheorySessionFilters, Query()],
) -> list[LessonTheorySessionResponse]:
    result = await repo.find(lesson_id=uid, user_id=user_id, filters=filters)
    return [LessonTheorySessionResponse.model_validate(session) for session in result]
