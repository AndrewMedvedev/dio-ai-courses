from unittest.mock import Mock

import pytest
from fastapi import status
from markitdown import (
    FailedConversionAttempt,
    FileConversionException,
    MissingDependencyException,
    UnsupportedFormatException,
)

from src.courses.domain.exceptions import InvalidDocumentError
from src.courses.utils import docs_processing


@pytest.mark.parametrize(
    "markdown",
    [
        "",
        " \n\t ",
        "# Only a title",
        "# Root\n\n## Child\n\n### Grandchild",
        "<!-- Slide number: 1 -->\n\n### Notes:",
        "<!-- first line\n# Not a heading\nlast line -->",
        "<!-- unfinished comment\n# Not a heading\nnot document text",
    ],
)
def test_empty_or_heading_only_markdown_has_no_document_content(markdown: str) -> None:
    assert docs_processing.split_markdown(markdown) == []
    assert not docs_processing.has_document_content(markdown)


@pytest.mark.parametrize(
    "markdown",
    [
        "Plain text",
        "# Title\nBody",
        "| Column | Value |\n| --- | --- |\n| Token | 42 |",
        "- First\n- Second",
        "```markdown\n# This is code\n<!-- preserve this -->\n```",
        "~~~html\n<!-- preserve this too -->\n~~~",
        "```html\n<!-- Unclosed fence still contains code -->",
        "An inline example: `<!-- preserve inline code -->`.",
    ],
)
def test_text_tables_lists_and_code_remain_meaningful(markdown: str) -> None:
    docs = docs_processing.split_markdown(markdown)
    assert docs
    assert docs_processing.has_document_content(markdown)
    assert "<!-- preserve" not in markdown or "<!-- preserve" in docs[0].page_content


def test_splitter_removes_comments_and_preserves_heading_metadata() -> None:
    markdown = (
        "<!-- Slide number: 1 -->\n# Guide\n## Alpha\nFirst token\n"
        "<!-- hidden\n### False heading\n-->\n"
        "### Details\nDeep token\n## Beta\nSecond token"
    )

    docs = docs_processing.split_markdown(markdown)

    assert [doc.metadata for doc in docs] == [
        {"H1": "Guide", "H2": "Alpha"},
        {"H1": "Guide", "H2": "Alpha", "H3": "Details"},
        {"H1": "Guide", "H2": "Beta"},
    ]
    assert all("<!--" not in doc.page_content for doc in docs)
    assert "First token" in docs[0].page_content
    assert "Deep token" in docs[1].page_content
    assert "Second token" in docs[2].page_content


def test_repeated_headings_preserve_all_fragments() -> None:
    markdown = "# Guide\n## Alpha\nFirst\n## Beta\nMiddle\n## Alpha\nLast"

    docs = docs_processing.split_markdown(markdown)

    assert [doc.metadata["H2"] for doc in docs] == ["Alpha", "Beta", "Alpha"]
    assert "First" in docs[0].page_content
    assert "Last" in docs[2].page_content


@pytest.mark.parametrize("marker", ["`", "~"])
def test_longer_closing_code_fence_does_not_preserve_following_comments(marker: str) -> None:
    markdown = (
        f"{marker * 3}html\n<!-- inside code -->\n{marker * 4}\n"
        "<!-- outside code -->\n## Section\nBody"
    )

    docs = docs_processing.split_markdown(markdown)
    content = "\n".join(doc.page_content for doc in docs)

    assert "<!-- inside code -->" in content
    assert "<!-- outside code -->" not in content
    assert "Body" in content


def test_multiline_inline_code_preserves_comments_without_swallowing_other_blocks() -> None:
    markdown = (
        "Example: `first line\n<!-- literal code token -->\nlast line`.\n"
        "<!-- outside inline code -->\n"
        "Unmatched ` opening\n\n<!-- after paragraph break -->\n"
        "```html\n<!-- fenced code token -->\n```\n"
        "<!-- outside fenced code -->\n## Section\nBody"
    )

    for newline in ("\n", "\r\n"):
        docs = docs_processing.split_markdown(markdown.replace("\n", newline))
        content = "\n".join(doc.page_content for doc in docs)

        assert "<!-- literal code token -->" in content
        assert "<!-- fenced code token -->" in content
        assert "<!-- outside inline code -->" not in content
        assert "<!-- after paragraph break -->" not in content
        assert "<!-- outside fenced code -->" not in content
        assert "Body" in content


def test_media_links_keep_alt_text_without_attachment_syntax() -> None:
    markdown = "# Guide\n![Diagram description](media://00000000-0000-0000-0000-000000000001)"

    docs = docs_processing.split_markdown(markdown)

    assert len(docs) == 1
    assert "Diagram description" in docs[0].page_content
    assert "media://" not in docs[0].page_content


@pytest.mark.parametrize("content", ["# Header", "## Child\n### Leaf", "### Notes:", "#"])
def test_real_heading_only_detection(content: str) -> None:
    assert docs_processing.is_heading_only(content)


@pytest.mark.parametrize("content", ["#not-heading", "# Header\nBody", "```\n# Code\n```"])
def test_heading_detection_does_not_discard_content(content: str) -> None:
    assert not docs_processing.is_heading_only(content)


@pytest.mark.parametrize(
    "error",
    [FileConversionException("invalid input"), UnsupportedFormatException("unsupported input")],
)
def test_conversion_errors_become_invalid_document(
    monkeypatch: pytest.MonkeyPatch, error: Exception,
) -> None:
    converter = Mock(side_effect=error)
    monkeypatch.setattr(docs_processing._markitdown, "convert_stream", converter)

    with pytest.raises(InvalidDocumentError) as exc_info:
        docs_processing.convert_document_to_md(b"invalid", ".pdf")

    assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.parametrize("wrapped", [False, True])
def test_missing_converter_dependency_remains_server_failure(
    monkeypatch: pytest.MonkeyPatch, wrapped: bool,
) -> None:
    missing = MissingDependencyException("converter library missing")
    error = FileConversionException(attempts=[
        FailedConversionAttempt(Mock(), (type(missing), missing, None)),
    ]) if wrapped else missing
    monkeypatch.setattr(docs_processing._markitdown, "convert_stream", Mock(side_effect=error))

    with pytest.raises(MissingDependencyException, match="converter library missing"):
        docs_processing.convert_document_to_md(b"input", ".docx")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "markdown", [b" \n\t", b"# Only a heading", b"<!-- Slide -->\n### Notes:"],
)
async def test_real_pipeline_rejects_documents_without_text(markdown: bytes) -> None:
    with pytest.raises(InvalidDocumentError):
        await docs_processing.document_pipeline(markdown, ".md")


@pytest.mark.asyncio
async def test_real_markdown_pipeline_preserves_text() -> None:
    docs = await docs_processing.document_pipeline(b"# Guide\n## Section\nDocument body", ".md")

    assert len(docs) == 1
    assert docs[0].metadata == {"H1": "Guide", "H2": "Section"}
    assert "Document body" in docs[0].page_content
