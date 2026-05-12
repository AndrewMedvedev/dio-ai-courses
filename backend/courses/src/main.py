from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import router as api_router
from src.app.services.bootstrap import create_tables

app = FastAPI(title="Courses Service", version="0.1.0")

# Keep local scripts/tests predictable even outside ASGI lifespan hooks.
create_tables()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_tables()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
