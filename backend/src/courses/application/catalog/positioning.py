from typing import Protocol

from collections.abc import Sequence
from uuid import UUID

from src.courses.domain.catalog.ranking import rank_between
from src.shared.domain.exceptions import NotFoundError

from .dtos.position import RelativePosition


class RankedEntity(Protocol):
    id: UUID
    rank: str


def resolve_rank(
    siblings: Sequence[RankedEntity],
    position: RelativePosition,
) -> str:
    anchor_id = position.before_id or position.after_id

    if anchor_id is None:
        last_rank = siblings[-1].rank if siblings else None
        return rank_between(last_rank, None)

    index = next(
        (index for index, sibling in enumerate(siblings) if sibling.id == anchor_id),
        None,
    )

    if index is None:
        raise NotFoundError(f"Position anchor {anchor_id} was not found")

    if position.before_id is not None:
        before = siblings[index - 1].rank if index > 0 else None
        return rank_between(before, siblings[index].rank)

    after = siblings[index + 1].rank if index + 1 < len(siblings) else None
    return rank_between(siblings[index].rank, after)
