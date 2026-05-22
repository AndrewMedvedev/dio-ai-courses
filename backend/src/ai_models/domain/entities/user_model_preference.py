from dataclasses import dataclass
from uuid import UUID

@dataclass
class UserModelPreference:
    id: UUID | None
    user_id: UUID
    model_id: UUID
