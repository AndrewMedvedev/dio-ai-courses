from dataclasses import dataclass


@dataclass(frozen=True)
class PermissionResult:
    """
    Результат проверки прав
    """

    allowed: bool
    reason: str | None = None

    def __post_init__(self) -> None:
        if not self.allowed and self.reason is None:
            raise ValueError("Reason required, when not allowed")
