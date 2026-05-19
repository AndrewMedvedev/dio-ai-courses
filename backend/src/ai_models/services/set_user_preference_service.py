from __future__ import annotations

from ai_models.infra.db.models import UserModelPreferenceDB
from ai_models.infra.db.repo import UserModelPreferenceRepository
from uuid import UUID


class SetUserPreferenceService:
    def __init__(self, repo: UserModelPreferenceRepository):
        self.repo = repo

    def execute(self, user_id: UUID, model_id: UUID) -> UserModelPreferenceDB:
        return self.repo.upsert(user_id=user_id, model_id=model_id)
