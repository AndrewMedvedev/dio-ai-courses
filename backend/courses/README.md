# Courses Backend (MVP)

## Run

```bash
cd backend/courses
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## API

- `GET /api/v1/models` - model catalog for client selector
- `POST /api/v1/courses`
- `GET /api/v1/courses`
- `GET /api/v1/courses/{course_id}`
- `PATCH /api/v1/courses/{course_id}`
- `DELETE /api/v1/courses/{course_id}` (soft delete)
- CRUD for blocks/lessons/practice
- enrollment/progress endpoints
- practice attempts endpoints
- async course generation endpoints

## OpenAI-compatible generation

Generation uses LangChain/LangGraph through OpenAI-compatible API.
Client must select `llm_model` from `GET /api/v1/models`.

For Yandex AI Studio compatible mode, set:
- `OPENAI_API_KEY=<yandex_api_key>`
- `OPENAI_BASE_URL=https://llm.api.cloud.yandex.net/v1`
- `YANDEX_FOLDER_ID=<folder_id>`

Swagger: `http://localhost:8001/docs`
