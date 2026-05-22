from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


def _run_weekly_sync() -> None:
    from core.config import settings
    from infra.db.conn import SessionLocal
    from ai_models.infra.db.repo import AIModelRepository
    from ai_models.infra.yandex_client import YandexClient
    from ai_models.services.sync_models_service import SyncModelsService

    session = SessionLocal()
    try:
        repo = AIModelRepository(session)
        client = YandexClient(
            api_key=settings.OPENAI_API_KEY,
            folder_id=settings.YANDEX_FOLDER_ID,
            base_url=settings.OPENAI_BASE_URL,
        )
        result = SyncModelsService(repo, client).execute()
        logger.info("Weekly AI models sync complete: %s", result)
    except Exception:
        logger.exception("Weekly AI models sync failed")
    finally:
        session.close()


scheduler = BackgroundScheduler()
scheduler.add_job(
    _run_weekly_sync,
    CronTrigger(day_of_week="mon", hour=3, minute=0),
    id="weekly_ai_models_sync",
)
