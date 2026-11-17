import importlib
import sys
from pathlib import Path
from types import ModuleType
from uuid import uuid4

import pytest
from pydantic import ValidationError


@pytest.fixture
def contracts(monkeypatch):
    # Load DTOs without importing the application, settings, services or lifespan.
    source = Path(__file__).resolve().parents[3] / 'src'
    for name in ('src', 'src.courses', 'src.courses.application',
                 'src.courses.application.catalog', 'src.courses.application.catalog.dtos',
                 'src.courses.application.conversations', 'src.courses.domain',
                 'src.courses.domain.catalog'):
        package = ModuleType(name)
        package.__path__ = [str(source.joinpath(*name.split('.')[1:]))]
        monkeypatch.setitem(sys.modules, name, package)
    before = set(sys.modules)
    position = importlib.import_module('src.courses.application.catalog.dtos.position')
    sys.modules['src.courses.application.catalog.dtos'].RelativePosition = position.RelativePosition
    modules = importlib.import_module('src.courses.application.catalog.dtos.module')
    lessons = importlib.import_module('src.courses.application.catalog.dtos.lesson')
    chats = importlib.import_module('src.courses.application.conversations.dtos')
    yield position, modules, lessons, chats
    for name in set(sys.modules) - before:
        if name.startswith('src.'):
            sys.modules.pop(name, None)


def test_new_module_and_lesson_payloads(contracts):
    position, modules, lessons, _ = contracts
    anchor = uuid4()
    module = modules.CreateModuleDTO.model_validate({
        'title': 'Module', 'description': '', 'learning_objectives': [],
        'position': {'beforeId': str(anchor)},
    })
    assert module.position.before_id == anchor
    assert 'order' not in modules.CreateModuleDTO.model_fields
    lesson = lessons.CreateLessonDTO.model_validate({
        'title': 'Lesson', 'description': '', 'learningObjectives': ['Goal'],
        'estimatedTimeMinutes': 15, 'position': {},
    })
    assert lesson.learning_objectives == ['Goal']
    assert lesson.estimated_time_minutes == 15
    with pytest.raises(ValidationError):
        position.RelativePosition(beforeId=anchor, afterId=uuid4())


def test_chat_ids_default_to_uuid_and_editor_requires_json_string(contracts):
    _, _, _, chats = contracts
    chat = chats.ChatDTO.model_validate({'content': 'Hello'})
    assert chat.chat_id is not None
    assert chat.model_dump(by_alias=True)['chatId'] == chat.chat_id
    with pytest.raises(ValidationError):
        chats.EditorChatDTO.model_validate({'content': 'Edit', 'content_type': 'text',
                                           'content_block': {'content_type': 'text'}, 'content_blocks': []})
    editor = chats.EditorChatDTO.model_validate({'content': 'Edit', 'content_type': 'text',
                                                'content_block': '{"content_type":"text","md_content":"Theory"}', 'content_blocks': []})
    assert isinstance(editor.content_block, str)
    module = chats.ModuleGenerationChatDTO.model_validate({'content': 'Generate', 'position': {}})
    assert module.position.before_id is None
