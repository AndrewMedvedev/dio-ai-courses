from .dataclasses import AIModel


def create_ai_model(
    name: str,
    description: str,
    context: int,
) -> AIModel:
    return AIModel(name=name, description=description, context=context)
