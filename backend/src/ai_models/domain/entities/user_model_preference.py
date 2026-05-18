from dataclasses import dataclass


@dataclass
class UserModelPreference:
    id: int | None
    user_id: int
    model_id: int
