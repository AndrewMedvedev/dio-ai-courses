import uvicorn

from src import router
from src.core.fastapi import app
from src.core.settings import app_config
from src.shared.api.exception_handler import setup_exception_handlers
from src.courses.infra import progress_rabbit  # noqa: F401
from src.llm_router.infra import invocation_rabbit  # noqa: F401

app.include_router(router)

setup_exception_handlers(app)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=app_config.port)  # noqa: S104
