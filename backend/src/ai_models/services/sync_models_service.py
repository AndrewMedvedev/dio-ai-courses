from __future__ import annotations

from ai_models.infra.db.models import AIModelDB
from ai_models.infra.db.repo import AIModelRepository
from ai_models.infra.yandex_client import YandexClient


class SyncModelsService:
    def __init__(self, repo: AIModelRepository, client: YandexClient):
        self.repo = repo
        self.client = client

    def execute(self) -> dict:
        raw = self.client.get_models()
        yandex_names = {m["name"] for m in raw}

        existing = self.repo.get_all()
        existing_by_name = {m.name: m for m in existing}

        to_add: list[AIModelDB] = []
        to_activate: list[AIModelDB] = []
        to_deactivate: list[AIModelDB] = []

        for raw_model in raw:
            name = raw_model["name"]
            if name in existing_by_name:
                db_model = existing_by_name[name]
                if not db_model.active:
                    to_activate.append(db_model)
            else:
                to_add.append(
                    AIModelDB(name=name, provider=raw_model["provider"], active=True)
                )

        for db_model in existing:
            if db_model.name not in yandex_names:
                to_deactivate.append(db_model)

        self.repo.sync(
            to_add=to_add,
            to_activate=to_activate,
            to_deactivate=to_deactivate,
        )

        return {
            "added": len(to_add),
            "activated": len(to_activate),
            "deactivated": len(to_deactivate),
        }
