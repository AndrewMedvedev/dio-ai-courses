import asyncio
from uuid import UUID

from src.courses.agents.course_generator.subagents import theorist
from src.courses.agents.schemas import Context
from src.courses.domain.vo import ContentType
from src.courses.infra.services import course_client

prompt = """Создай простую IT-схему процесса обработки API-запроса: Клиент → API Gateway → Backend → База данных → Backend → Клиент. Покажи этапы соединёнными стрелками, добавь небольшие иконки для каждого компонента. Минималистичный плоский дизайн, белый фон, синие и серые оттенки, чёткие подписи, квадратный формат."""


course_id = UUID("693e6c1a-44a5-46f1-a7b3-d94345a670ee")
user_id = UUID("3887cb68-d0ab-46d0-9f15-d13d4b4fc78f")


async def test_theorist():
    result = await theorist.generate_image(
        client=course_client,
        prompt=prompt,
        context=Context(course_id=course_id, user_id=user_id, prompt=prompt),
        content_type=ContentType.IMAGE,
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(test_theorist())
