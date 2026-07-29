from ..domain.entities import (
    AnyAssignment,
    AnyContentBlock,
    AssignmentType,
    ContentType,
    Lesson,
)
from ..schemas import DetailedAnswerTest


def get_assignment_context(assignment: AnyAssignment) -> str:
    assignment_type_map = {
        AssignmentType.FILE_UPLOAD: "Задание с загрузкой файла",
        AssignmentType.GITHUB: "Задание на платформе GitHub",
    }
    context = (
        f"## Практическое задание: '{assignment.title}'\n"
        f"**{assignment_type_map[assignment.assignment_type]}**\n\n"
    )
    match assignment.assignment_type:
        case AssignmentType.FILE_UPLOAD:
            context += (
                "### Постановка задачи\n"
                f"{assignment.description}\n\n"
                "### Инструкция по оформлению\n"
                f"{assignment.submission_instructions}\n\n"  # type: ignore  # ruff: ignore[blanket-type-ignore]
            )
    context += f"### Критерии оценивания{'\n - '.join(assignment.evaluation_criteria)}"
    context += "\n"
    return context


def get_content_blocks_context(content_blocks: list[AnyContentBlock]) -> str:
    context = "## Теоретический материал\n\n"
    for content_block in content_blocks:
        context += f"### {content_block.content_type.value}\n"
        match content_block.content_type:
            case ContentType.TEXT:
                context += f"{content_block.md_content}\n\n"  # type: ignore  # ruff: ignore[blanket-type-ignore]
            case ContentType.QUIZ:
                context += (
                    "Вопросы для самопроверки:\n"
                    f" - {
                        '\n - '.join([
                            f'вопрос: {question}; ответ: {answer}'
                            for question, answer in content_block.questions  # type: ignore
                        ])
                    }"
                )
            case ContentType.PROGRAM_CODE:
                context += (
                    f"```{content_block.language}\n{content_block.code}\n```\n\n"  # type: ignore  # ruff: ignore[blanket-type-ignore]
                    f"Объяснение: {content_block.explanation}"  # type: ignore  # ruff: ignore[blanket-type-ignore]
                )
            case ContentType.MERMAID:
                context += (
                    f"Название диаграммы: {content_block.title}\n"  # type: ignore  # ruff: ignore[blanket-type-ignore]
                    f"Диаграмма:\n{content_block.md_content}\n"  # type: ignore  # ruff: ignore[blanket-type-ignore]
                    f"Объяснение: {content_block.explanation}"  # type: ignore  # ruff: ignore[blanket-type-ignore]
                )
            case (
                ContentType.MATH_FORMULA
                | ContentType.CHEMICAL_FORMULA
                | ContentType.MUSICAL_NOTATION
            ):
                context += (
                    f"Формула:\n{content_block.formula}\n"  # type: ignore  # ruff: ignore[blanket-type-ignore]
                    f"Объяснение: {content_block.explanation}"  # type: ignore  # ruff: ignore[blanket-type-ignore]
                )

        context += "\n\n"
    return context


def get_lesson_context(
    lesson: Lesson,
    include_content_blocks: bool = True,
    include_assignment: bool = False,
) -> str:
    """Получение LLM-friendly контекста текущего урока в Markdown формате."""

    context = (
        f"# Урок [{lesson.order}]: '{lesson.title}'\n"
        f"**Описание**: {lesson.description}\n\n"
        "**Цели обучения**:\n"
        f" - {f'{lesson.learning_objectives}'}"
        "\n\n"
    )
    if lesson.content_blocks and include_content_blocks:
        context += get_content_blocks_context(lesson.content_blocks)  # type: ignore  # ruff: ignore[blanket-type-ignore]
    if include_assignment and lesson.assignment is not None:
        context += get_assignment_context(lesson.assignment)
    return context


def prepare_test_for_checking(given_answers: list[str], test: DetailedAnswerTest) -> str:
    """Подготовка тестирования к проверке"""

    context = f"## {test.title}\n\n"
    for i, (given_answer, question) in enumerate(zip(given_answers, test.questions, strict=False)):
        context += (
            f"### Вопрос №{i + 1}:\n"
            f"**Текст вопроса:** {question.text}\n\n"
            f"**Ожидаемый ответ:** {question.excepted_answer}\n"
            f"**Максимальный балл:** {question.points}\n\n"
            f"**Ответ студента:** {given_answer}\n\n"
        )
    return context
