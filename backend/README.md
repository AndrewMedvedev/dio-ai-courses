# Courses Backend (MVP)

## Run

```bash
cd backend
.venv\\Scripts\\activate
python -m uvicorn main:app --reload --port 8001
```

## API

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

For Yandex AI Studio compatible mode, set:
- `OPENAI_API_KEY=<yandex_api_key>`
- `OPENAI_BASE_URL=https://llm.api.cloud.yandex.net/v1`
- `YANDEX_FOLDER_ID=<folder_id>`

Swagger: `http://localhost:8001/docs`
