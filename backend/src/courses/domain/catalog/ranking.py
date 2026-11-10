"""
Дробная индексация (fractional indexing) для порядка элементов коллекции.

Ранги — строки из цифр base62, сравниваемые побайтно (в PostgreSQL колонка с ``COLLATE "C"``).
Между любыми двумя рангами всегда можно вставить новый без перенумерации соседей.
Инвариант: ранг никогда не оканчивается на минимальную цифру ``0``.
"""

DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

MAX_RANK_LENGTH = 128


def _midpoint(left: str, right: str | None) -> str:
    if right is not None:
        prefix_length = 0
        while (
            prefix_length < len(right)
            and (left[prefix_length : prefix_length + 1] or DIGITS[0]) == right[prefix_length]
        ):
            prefix_length += 1

        if prefix_length > 0:
            return right[:prefix_length] + _midpoint(left[prefix_length:], right[prefix_length:])

    left_digit = DIGITS.index(left[0]) if left else 0
    right_digit = DIGITS.index(right[0]) if right is not None else len(DIGITS)

    if right_digit - left_digit > 1:
        return DIGITS[(left_digit + right_digit) // 2]

    if right is not None and len(right) > 1:
        return right[0]

    return DIGITS[left_digit] + _midpoint(left[1:], None)


def rank_between(
    before: str | None,
    after: str | None,
) -> str:
    if before is not None and after is not None and before >= after:
        raise ValueError(f"Invalid rank bounds: {before!r} >= {after!r}")

    rank = _midpoint(before or "", after)

    if len(rank) > MAX_RANK_LENGTH:
        raise ValueError(f"Rank exceeds maximum length of {MAX_RANK_LENGTH}")

    return rank


def generate_ranks(count: int) -> list[str]:
    if count < 0:
        raise ValueError("Rank count cannot be negative.")

    ranks: list[str] = []
    previous: str | None = None

    for _ in range(count):
        previous = rank_between(previous, None)
        ranks.append(previous)

    return ranks


__all__ = [
    "generate_ranks",
    "rank_between",
]
