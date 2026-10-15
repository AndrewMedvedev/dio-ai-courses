import logging
from json import dumps

from src.core.others import tokens_encoder
from src.llm_service import (
    BaseAgentMiddleware,
    LLMServiceProtocol,
    LLMTextService,
)

logger = logging.getLogger(__name__)


class SummarizationMiddleware(BaseAgentMiddleware):
    def __init__(
        self,
        system_prompt: str,
        number_of_tokens: int,
    ) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        self.number_of_tokens = number_of_tokens
        self.system_prompt = system_prompt

    async def before_model(
        self,
        service: LLMServiceProtocol,
        messages: list[dict],
    ) -> list[dict]:

        router = LLMTextService(
            client=service._client,  # noqa: SLF001
            system_prompt=self.system_prompt,
        )
        str_messages = dumps(messages)
        count_tokens = len(tokens_encoder.encode(text=str_messages))
        if count_tokens >= self.number_of_tokens:
            result = await router.invoke(messages=messages)
            return [{"role": "assistant", "content": result.raw_text}]
        return messages
