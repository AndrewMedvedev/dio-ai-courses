from typing import Annotated, Any

from collections.abc import Callable
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.iam.application.dtos import Identity, IdentityType
from src.iam.application.services import blacklist
from src.iam.domain.exceptions import UnauthorizedError
from src.iam.security import decode_token
from src.shared.infra.cache import Cache

from .base import get_cache

http_bearer = HTTPBearer(auto_error=False)


def _require_claim[T](
        payload: dict[str, Any], field: str, expected_type: Callable[[Any], T],
) -> T | None:

    if field not in payload:
        raise UnauthorizedError(f"Missing required claim '{field}'.")

    try:
        value = payload[field]
        return None if value is None else expected_type(value)
    except (ValueError, TypeError):
        raise UnauthorizedError(f"Invalid claim '{field}' value.") from None


def _build_identity_from_payload(payload: dict[str, Any]) -> Identity:
    """Выполняет парсинг JWT payload и валидирует claims."""

    return Identity(
        id=_require_claim(payload, "sub", UUID),
        type=_require_claim(payload, "idt", IdentityType),
        email=_require_claim(payload, "email", str),
        organization_id=_require_claim(payload, "org_id", UUID),
        membership_id=_require_claim(payload, "mid", UUID),
        roles=_require_claim(payload, "roles", frozenset),
        permissions=_require_claim(payload, "perms", frozenset),
    )


async def get_current_identity(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(http_bearer)],
        cache: Cache[bool] = Depends(get_cache),
) -> Identity:
    if credentials is None:
        raise UnauthorizedError("Authorization header is missing.")

    payload = decode_token(credentials.credentials)

    jti = payload.get("jti")
    if jti is None:
        raise UnauthorizedError("Missing required jti claim.")

    if await blacklist.is_revoked(jti, cache):
        raise UnauthorizedError("Token was revoked.")

    return _build_identity_from_payload(payload)


CurrentIdentity = Annotated[Identity, Depends(get_current_identity)]
