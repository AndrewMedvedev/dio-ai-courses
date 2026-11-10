import logging

import openai
from tenacity import RetryCallState

from src.llm_router.domain.exceptions import StructuredOutputError

logger = logging.getLogger(__name__)

RATE_LIMIT_CODE = 429
INTERNAL_SERVER_CODE = 500

RETRYABLE_STATUS_CODES = {
    RATE_LIMIT_CODE,
    INTERNAL_SERVER_CODE,
    502,
    503,
    504,
}

NUMBER_RETRY_STATUS_CODES = 4

NUMBER_RETRY = 3


def get_status_code(exc: BaseException) -> int | None:

    if isinstance(exc, openai.APIStatusError):
        return exc.status_code

    return None


def is_retryable_error(exc: BaseException) -> bool:

    if isinstance(exc, (KeyboardInterrupt, SystemExit)):
        return False

    if isinstance(exc, openai.APIStatusError):
        return exc.status_code in RETRYABLE_STATUS_CODES
    if isinstance(exc, StructuredOutputError):
        return True
    return isinstance(exc, Exception)


def wait_strategy(retry_state: RetryCallState) -> float:
    outcome = retry_state.outcome

    if outcome is None:
        return 0.0
    exc = outcome.exception()

    if exc is None:
        return 0.0

    attempt = retry_state.attempt_number
    status_code = get_status_code(exc)

    if status_code == RATE_LIMIT_CODE:
        response = getattr(exc, "response", None)

        if response is not None:
            retry_after = response.headers.get("retry-after")

            if retry_after:
                try:
                    return float(retry_after)
                except TypeError, ValueError:
                    pass

        # 5, 10, 20, 40, 60, 60...
        return min(
            60.0,
            5.0 * (2 ** (attempt - 1)),
        )

    if status_code is not None and INTERNAL_SERVER_CODE <= status_code <= 599:  # noqa: PLR2004
        # 3, 6, 12, 24, 30...
        return min(
            30.0,
            3.0 * (2 ** (attempt - 1)),
        )

    # Ошибка нашего кода:
    # 1, 2, 4...
    return min(
        5.0,
        1.0 * (2 ** (attempt - 1)),
    )


def stop_strategy(retry_state: RetryCallState) -> bool:
    outcome = retry_state.outcome

    if outcome is None:
        return False

    exc = outcome.exception()

    if exc is None:
        return True

    attempt = retry_state.attempt_number
    status_code = get_status_code(exc)

    if status_code in RETRYABLE_STATUS_CODES:
        return attempt >= NUMBER_RETRY_STATUS_CODES

    return attempt >= NUMBER_RETRY
