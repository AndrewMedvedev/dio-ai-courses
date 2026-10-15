import uvicorn

from src import router
from src.core.fastapi import app
from src.core.settings import app_config
from src.shared.api.exception_handler import setup_exception_handlers
from src.feedback.api.v1.feedback import router as feedback_router
from src.courses.infra import progress_rabbit  # noqa: F401
from src.llm_router.infra import invocation_rabbit  # noqa: F401

app.include_router(router)
app.include_router(feedback_router, prefix="/api/v1")

setup_exception_handlers(app)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=app_config.port)  # noqa: S104
