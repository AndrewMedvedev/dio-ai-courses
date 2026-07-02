from pydantic import BaseModel, Field


class AIModelSchema(BaseModel):
    name: str = Field(description="Имя модели")
    description: str = Field(description=" Точное описание модели")
    context: int = Field(description="контекст модели")
