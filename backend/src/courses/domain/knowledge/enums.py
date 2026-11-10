from enum import StrEnum, auto


class DocumentNodeType(StrEnum):
    TOC = auto()
    HEADING = auto()
    TEXT = auto()
