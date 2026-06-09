from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import-untyped]
from apscheduler.triggers.cron import CronTrigger  # type: ignore[import-untyped]

from ..core.database import session_factory  # фабрика сессий, не get_db
from ..shared.schemas import PageParams
from .domain.services import create_ai_model
from .infra.repository import SqlAIModelRepository
from .rest import get_yandex_ai_models

logger = logging.getLogger(__name__)


async def run_weekly_sync() -> None:
    async with session_factory() as session:
        repo = SqlAIModelRepository(session)
        # 1. Получаем список активных моделей от API (список строк)
        active_model_names = await get_yandex_ai_models()  # set

        # 2. Загружаем ВСЕ существующие модели из БД, обходя пагинацию
        all_existing_models = []
        page_params = PageParams(size=100, page=1)
        page = await repo.paginate(page_params)
        all_existing_models.extend(page.items)
        while page.has_next:
            page_params = PageParams(size=page.size, page=page.page + 1)
            page = await repo.paginate(page_params)
            all_existing_models.extend(page.items)

        existing_names = {model.name for model in all_existing_models}

        # 3. Деактивируем модели, которые есть в БД, но отсутствуют в API
        for model in all_existing_models:
            if model.name not in active_model_names and model.is_active:
                model.mark_is_not_active()
                await repo.upsert(model)

        # 4. Добавляем новые модели из API
        for name in active_model_names:
            if name not in existing_names:
                new_model = create_ai_model(name=name, provider="YANDEX")
                await repo.create(new_model)

        await session.commit()
        logger.info("Weekly AI models sync complete")


scheduler = AsyncIOScheduler()
scheduler.add_job(
    run_weekly_sync,
    CronTrigger(day_of_week="sat", hour=3, minute=0),
    id="weekly_ai_models_sync",
)
