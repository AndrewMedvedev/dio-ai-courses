from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import-untyped]
from apscheduler.triggers.cron import CronTrigger  # type: ignore[import-untyped]

from ..core.database import session_factory  # фабрика сессий, не get_db
from ..shared.schemas import Page, PageParams
from .database.repository import SqlAIModelRepository
from .domain.dataclasses import AIModel
from .rest import get_yandex_ai_models

logger = logging.getLogger(__name__)


async def _run_weekly_sync() -> None:
    async with session_factory() as session:  # явное создание сессии
        repo = SqlAIModelRepository(session)
        models = await get_yandex_ai_models()
        try:
            data: Page[AIModel] = await repo.paginate(PageParams(size=50))
            for model in data.items:
                if model.name not in models:
                    model.mark_is_active()
                    await repo.upsert(model)

            logger.info("Weekly AI models sync complete")
        except Exception:
            logger.exception("Weekly AI models sync failed")

        # finally с session.close() больше не нужен — async with закроет сам


scheduler = AsyncIOScheduler()
scheduler.add_job(
    _run_weekly_sync,
    CronTrigger(day_of_week="mon", hour=3, minute=0),
    id="weekly_ai_models_sync",
)
