from __future__ import annotations
from uuid import UUID

from .models import AIModelDB, UserModelPreferenceDB


class AIModelRepository:
    def __init__(self, session):
        self.session = session

    def get_all(self) -> list[AIModelDB]:
        return self.session.query(AIModelDB).all()

    def sync(
        self,
        *,
        to_add: list[AIModelDB],
        to_activate: list[AIModelDB],
        to_deactivate: list[AIModelDB],
    ) -> None:
        for model in to_activate:
            model.is_active = True
        for model in to_deactivate:
            model.is_active = False
        self.session.add_all(to_add)
        self.session.commit()


class UserModelPreferenceRepository:
    def __init__(self, session):
        self.session = session

    def upsert(self, user_id: UUID, model_id: UUID) -> UserModelPreferenceDB:
        existing = (
            self.session.query(UserModelPreferenceDB)
            .filter_by(user_id=user_id)
            .first()
        )
        if existing:
            existing.model_id = model_id
            self.session.commit()
            return existing
        preference = UserModelPreferenceDB(user_id=user_id, model_id=model_id)
        self.session.add(preference)
        self.session.commit()
        return preference

    def get_by_user(self, user_id: UUID) -> UserModelPreferenceDB | None:
        return (
            self.session.query(UserModelPreferenceDB)
            .filter_by(user_id=user_id)
            .first()
        )
