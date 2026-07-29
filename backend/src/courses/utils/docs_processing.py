# document_hierarchy_pipeline.py
import asyncio
import contextlib
import io
import re
from dataclasses import dataclass, field
from uuid import UUID

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter
from markitdown import MarkItDown

from ...core.infrastructure import thread_executor


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


# Паттерн компилируется один раз на уровне модуля, а не при каждом вызове finditer
MEDIA_PATTERN = re.compile(r"!\[(.*?)\]\(media://([0-9a-fA-F-]+)\)")

# Заголовок, состоящий только из решёток и пробелов ("##", "###   ") — считаем мусором:
# это артефакт разбиения, когда после заголовка нет вообще никакого текста.
_HEADING_ONLY_RE = re.compile(r"^#{1,6}\s*$")


# document_hierarchy_pipeline.py

MEDIA_PATTERN = re.compile(r"!\[(.*?)\]\(media://([0-9a-fA-F-]+)\)")
_HEADING_ONLY_RE = re.compile(r"^#{1,6}\s*$")


class DocumentHierarchyPipeline:
    DEFAULT_HEADERS: list[tuple[str, str]] = [  # ruff: ignore[mutable-class-default]
        ("#", "H1"),
        ("##", "H2"),
        ("###", "H3"),
        ("####", "H4"),
    ]
    _markitdown: MarkItDown = MarkItDown()

    @classmethod
    def convert_document_to_md(cls, file: bytes, file_extension: str) -> str:
        return cls._markitdown.convert_stream(
            io.BytesIO(file), file_extension=file_extension
        ).markdown

    @classmethod
    async def convert_document_to_md_async(cls, file: bytes, file_extension: str) -> str:
        # convert_stream блокирует event loop — выносим в отдельный поток
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            thread_executor,
            cls.convert_document_to_md,
            file,
            file_extension,
        )

    @staticmethod
    def extract_media(md_content: str) -> list["MediaChunk"]:
        media = []
        for match in MEDIA_PATTERN.finditer(md_content):
            alt, attachment_id = match.groups()
            with contextlib.suppress(ValueError):
                media.append(
                    MediaChunk(
                        attachment_id=UUID(attachment_id),
                        alt_text=alt.strip(),
                        start_char=match.start(),
                        end_char=match.end(),
                    )
                )
        return media

    @staticmethod
    def remove_media_syntax(md_content: str, chunks: list["MediaChunk"]) -> str:
        # Один проход + join() вместо слайс-присваивания в list (было O(n*m), стало O(n))
        if not chunks:
            return md_content
        parts, cursor = [], 0
        for chunk in sorted(chunks, key=lambda c: c.start_char):
            start = max(chunk.start_char, cursor)
            if start >= chunk.end_char:
                continue
            parts.extend(md_content[cursor:start])
            parts.extend(chunk.alt_text or "")
            cursor = chunk.end_char
        parts.append(md_content[cursor:])
        return "".join(parts)

    @classmethod
    def get_header_order(
        cls, headers_to_split_on: list[tuple[str, str]] | None = None
    ) -> list[str]:
        return [name for _, name in (headers_to_split_on or cls.DEFAULT_HEADERS)]

    @staticmethod
    def get_heading_chain(doc: Document, header_order: list[str]) -> list[str]:
        return [v.strip() for k in header_order if (v := doc.metadata.get(k)) and v.strip()]

    @classmethod
    def is_heading_only(cls, content: str) -> bool:
        # Заголовок без текста после него ("##" и т.п.) — мусорный чанк
        return bool(_HEADING_ONLY_RE.fullmatch(content.strip()))

    def split_markdown(self, md_content: str, headers_to_split_on=None) -> list[Document]:
        if not md_content.strip():
            return []
        headers = headers_to_split_on or self.DEFAULT_HEADERS
        splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers, strip_headers=False)
        cleaned = self.remove_media_syntax(md_content, self.extract_media(md_content))
        docs = splitter.split_text(cleaned)
        return [d for d in docs if not self.is_heading_only(d.page_content)]

    async def __call__(self, file: bytes, file_extension: str) -> list[Document]:
        md = await self.convert_document_to_md_async(file=file, file_extension=file_extension)
        return self.split_markdown(md)


"""
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
"""
