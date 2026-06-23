import contextlib
import io
import pathlib
import re
from dataclasses import dataclass, field
from uuid import UUID

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter
from markitdown import MarkItDown

MEDIA_PATTERN = r"!\[(.*?)\]\(media://([0-9a-fA-F-]+)\)"
HEADER_PATTERN = re.compile(r"^(#{1,6})\s+(.*)$")


@dataclass(frozen=True)
class TextChunk:
    order: int
    content: str
    context_heading: list[str] = field(default_factory=list)


@dataclass(frozen=True, kw_only=True)
class MediaChunk:
    attachment_id: UUID
    alt_text: str | None = None
    start_char: int
    end_char: int


class DocumentHierarchyPipeline:
    @staticmethod
    def convert_document_to_md(file: bytes, file_extension: str) -> str:
        result = MarkItDown().convert_stream(io.BytesIO(file), file_extension=file_extension)
        return result.markdown

    @staticmethod
    def extract_media(md_content: str) -> list[MediaChunk]:
        """Извлечение медиа контента из текста статьи"""

        media = []
        for match in re.finditer(MEDIA_PATTERN, md_content):
            alt, attachment_id = match.groups()

            with contextlib.suppress(ValueError):
                attachment_id = UUID(attachment_id)

                media.append(
                    MediaChunk(
                        attachment_id=attachment_id,
                        alt_text=alt.strip(),
                        start_char=match.start(),
                        end_char=match.end(),
                    )
                )

        return media

    @staticmethod
    def remove_media_syntax(md_content: str, chunks: list[MediaChunk]) -> str:
        """Удаление медиа ссылок ![alt](media://...), оставляя alt-текст"""

        chars = list(md_content)

        for chunk in sorted(chunks, key=lambda x: x.start_char, reverse=True):
            # Замена на alt-текст
            replacement = "" if chunk.alt_text is None else chunk.alt_text
            chars[chunk.start_char : chunk.end_char] = replacement

        return "".join(chars)

    def split_markdown(
        self,
        md_content: str,
        headers_to_split_on: list[tuple[str, str]] | None = None,
    ) -> list[Document]:
        """Разбиение Markdown текста на чанки с определением медиа"""

        if not md_content.strip():
            return []

        if headers_to_split_on is None:
            headers_to_split_on = [
                ("#", "H1"),
                ("##", "H2"),
                ("###", "H3"),
                ("####", "H4"),
            ]

        # Первичное разбиение по заголовкам
        markdown_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=headers_to_split_on, strip_headers=False
        )

        # Извлечение медиа контента
        media_chunks = self.extract_media(md_content)

        # Удаление медиа Markdown синтаксиса для чистоты текста
        cleaned_content = self.remove_media_syntax(md_content, chunks=media_chunks)

        return markdown_splitter.split_text(cleaned_content)

    def __call__(self, file: bytes, file_extension: str) -> list[Document]:
        md_document = self.convert_document_to_md(file=file, file_extension=file_extension)
        return self.split_markdown(md_document)


# Пример использования
if __name__ == "__main__":
    file_path = pathlib.Path(
        "/Users/medvedevandre/projects/dio-ai-courses/backend/методичка по БД(автосалон).docx"
    )
    document = file_path.read_bytes()
    pipeline = DocumentHierarchyPipeline()(
        file=document,
        file_extension=".docx",
    )

    # Вывод для проверки
    print(pipeline)
