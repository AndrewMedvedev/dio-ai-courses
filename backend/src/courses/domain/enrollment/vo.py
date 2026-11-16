from enum import StrEnum, auto


class MemberRole(StrEnum):
    TEACHER = auto()  # Преподаватель
    MODERATOR = auto()  # Модератор
    STUDENT = auto()  # Студент

    @property
    def level(self) -> int:
        return {
            MemberRole.STUDENT: 1,
            MemberRole.MODERATOR: 2,
            MemberRole.TEACHER: 3,
        }[self]

    def can_assign(self, role: MemberRole) -> bool:
        return self.level >= role.level
