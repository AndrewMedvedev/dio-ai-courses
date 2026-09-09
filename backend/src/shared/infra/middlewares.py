import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from .request_context import create_request_id, reset_request_id, set_request_id


class RequestIdFilter(logging.Filter):
    def __init__(self, request_id: str):
        super().__init__()
        self.request_id = request_id

    def filter(self, record):
        record.request_id = self.request_id
        return True


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # ruff: ignore[no-self-use]
        request_id = create_request_id(request.headers.get("X-Request-ID"))
        context_token = set_request_id(request_id)

        filter_ = RequestIdFilter(request_id)

        root_logger = logging.getLogger()
        for handler in root_logger.handlers:
            handler.addFilter(filter_)

        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            for handler in root_logger.handlers:
                if filter_ in handler.filters:
                    handler.removeFilter(filter_)
            reset_request_id(context_token)
