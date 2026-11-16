/// <reference types="node" />
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestInstance,
} from 'react-test-renderer';
import { indexedDB } from 'fake-indexeddb';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  getCourseLearningStructure,
  getLessonById,
  getLessonContentBlocks,
} from '@/entities/course';
import { useRefreshOnReturn } from '@/shared/lib/use-refresh-on-return';
import { CreatorChatView } from '@/features/create-course-chat';
import { CourseCatalog } from '@/widgets/course-catalog';
import {
  LessonContentEditor,
  type LessonContentChange,
} from '@/features/edit-lesson-content';
import { useSessionStore, getPersistenceScope } from '@/entities/session';
import {
  createAgentConversationKey,
  useAgentStore,
} from '@/entities/agent-chat';
import {
  generationJobKey,
  useGenerationJobsStore,
} from '@/entities/generation-job';
import {
  LessonPracticeAgent,
  LessonTestAgent,
} from '@/features/lesson-assessment';
import { draftKey, useEditorDraftStore } from '@/features/edit-course-draft';
import {
  useLocalState,
  readStoredFiles,
  writeStoredFiles,
} from '@/shared/lib/storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites)
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values.set(key, value);
  }
}
const storage = new MemoryStorage();
const events = new EventTarget();
Object.assign(globalThis, {
  indexedDB,
  window: Object.assign(events, {
    localStorage: storage,
    location: new URL('http://localhost/'),
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0),
    cancelAnimationFrame: clearTimeout,
  }),
});
let calls: string[] = [];
let responder: (
  url: string,
  options?: RequestInit,
) => Response | Promise<Response>;
globalThis.fetch = (input, options) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  calls.push(url);
  return Promise.resolve(responder(url, options));
};
beforeEach(() => {
  calls = [];
  storage.failWrites = false;
  useSessionStore.setState({
    user: { id: 'student-a' },
    identity: null,
    organizationId: 'org-a',
    membershipId: 'member-a',
  });
  storage.setItem(
    'aicolab_session',
    JSON.stringify({
      accessToken: 'mock-only',
      expiresAt: Date.now() / 1000 + 3600,
    }),
  );
  responder = (url) => {
    if (url.includes('/lessons/'))
      return Response.json({
        id: url.split('/').pop(),
        title: 'Current lesson',
      });
    if (url.includes('/agent/check/'))
      return Response.json({ score: 95, ai_feedback: 'Решение верное' });
    if (url.includes('/agent/practices/'))
      return Response.json({
        practice_id: 'practice-mock',
        practice: { title: 'Mock practice', allowed_extensions: ['.py'] },
      });
    if (url.includes('/agent/tests/'))
      return Response.json({
        practice_id: 'test-mock',
        practice: {
          test_type: 'multiple_choice',
          questions: [{ text: '2 + 2?', options: ['4', '5'] }],
        },
      });
    throw new Error(`Unexpected request blocked: ${url}`);
  };
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 15));
async function render(element: ReactElement) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
    await tick();
  });
  return renderer;
}
const click = async (button: ReactTestInstance) => {
  for (
    let attempt = 0;
    button.props.disabled === true && attempt < 30;
    attempt += 1
  ) {
    await act(tick);
  }
  assert.equal(button.props.disabled === true, false);
  await act(async () => {
    await (button.props.onClick as () => Promise<void>)();
    await tick();
  });
};
function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType('button').find((item) =>
    item.children
      .filter((child) => typeof child === 'string')
      .join('')
      .includes(text),
  )!;
}
const assessmentKey = (lesson: string, kind = 'practice') =>
  `lesson-assessment:${getPersistenceScope()}:module:${lesson}:${kind}:v1`;
async function unmount(renderer: ReactTestRenderer) {
  act(() => renderer.unmount());
  await tick();
}

void test('practice: draft, result and AI feedback survive remount and storage hydration without new POST', async () => {
  let page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="practice-1" />,
  );
  await click(button(page, 'Подготовить задание'));
  act(() => {
    (
      page.root.findByType('textarea').props.onChange as (
        event: unknown,
      ) => void
    )({ target: { value: 'print(42)' } });
  });
  await unmount(page);
  page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="practice-1" />,
  );
  assert.equal(page.root.findByType('textarea').props.value, 'print(42)');
  assert.equal(calls.length, 1);
  await click(button(page, 'Проверить решение'));
  assert.match(JSON.stringify(page.toJSON()), /Решение верное/);
  const saved = storage.getItem(assessmentKey('practice-1'))!;
  await unmount(page);
  storage.setItem(assessmentKey('practice-restored'), saved);
  page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="practice-restored" />,
  );
  assert.match(JSON.stringify(page.toJSON()), /Решение верное/);
  assert.equal(page.root.findByType('textarea').props.value, 'print(42)');
  assert.equal(calls.length, 3);
  assert.equal(button(page, 'Отправлено').props.disabled, true);
  await click(button(page, 'Новое задание'));
  assert.equal(page.root.findByType('textarea').props.value, '');
  assert.doesNotMatch(JSON.stringify(page.toJSON()), /Решение верное/);
  assert.equal(calls.length, 4);
  await unmount(page);
});

void test('test: selected answers and checked result restore from localStorage', async () => {
  let page = await render(
    <LessonTestAgent moduleId="module" lessonId="test-1" />,
  );
  await click(button(page, 'Подготовить вопросы'));
  act(() => {
    (page.root.findAllByType('input')[0].props.onChange as () => void)();
  });
  await unmount(page);
  page = await render(<LessonTestAgent moduleId="module" lessonId="test-1" />);
  assert.equal(page.root.findAllByType('input')[0].props.checked, true);
  await click(button(page, 'Проверить ответы'));
  const saved = storage.getItem(assessmentKey('test-1', 'test'))!;
  await unmount(page);
  storage.setItem(assessmentKey('test-restored', 'test'), saved);
  page = await render(
    <LessonTestAgent moduleId="module" lessonId="test-restored" />,
  );
  assert.equal(button(page, 'Тест сдан').props.disabled, true);
  assert.equal(calls.length, 3);
  await unmount(page);
});

void test('late response stays with its original lesson, request is not duplicated on remount', async () => {
  let resolve!: (response: Response) => void;
  responder = () =>
    new Promise<Response>((done) => {
      resolve = done;
    });
  let page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="slow" />,
  );
  let request!: Promise<void>;
  act(() => {
    request = (
      button(page, 'Подготовить задание').props.onClick as () => Promise<void>
    )();
  });
  await unmount(page);
  page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="slow" />,
  );
  assert.equal(button(page, 'Готовим задание').props.disabled, true);
  assert.equal(calls.length, 1);
  await act(async () => {
    page.update(<LessonPracticeAgent moduleId="module" lessonId="other" />);
    await tick();
  });
  await act(async () => {
    resolve(
      Response.json({
        practice_id: 'slow-id',
        practice: { title: 'Delayed practice' },
      }),
    );
    await request;
  });
  assert.doesNotMatch(JSON.stringify(page.toJSON()), /Delayed practice/);
  await act(async () => {
    page.update(<LessonPracticeAgent moduleId="module" lessonId="slow" />);
    await tick();
  });
  assert.match(JSON.stringify(page.toJSON()), /Delayed practice/);
  await unmount(page);
});

void test('reload during a check shows interrupted status and does not resend', async () => {
  storage.setItem(
    assessmentKey('interrupted'),
    JSON.stringify({
      version: 1,
      state: {
        value: {
          test: null,
          assignment: { title: 'Saved practice' },
          practiceId: 'saved-id',
          answers: {},
          questionIndex: 0,
          solution: 'saved answer',
          entryMode: 'text',
          result: null,
          operation: 'check',
          error: '',
        },
      },
    }),
  );
  const page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="interrupted" />,
  );
  assert.match(JSON.stringify(page.toJSON()), /автоматически не повторяется/);
  assert.equal(calls.length, 0);
  await unmount(page);
});

void test('practice drafts are isolated by account and organization', async () => {
  const page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="isolation" />,
  );
  await click(button(page, 'Подготовить задание'));
  act(() => {
    useSessionStore.setState({ user: { id: 'student-b' } });
  });
  assert.ok(button(page, 'Подготовить задание'));
  act(() => {
    useSessionStore.setState({
      user: { id: 'student-a' },
      organizationId: 'org-b',
    });
  });
  assert.ok(button(page, 'Подготовить задание'));
  act(() => {
    useSessionStore.setState({ organizationId: 'org-a' });
  });
  assert.match(JSON.stringify(page.toJSON()), /Mock practice/);
  assert.equal(calls.length, 1);
  await unmount(page);
});

void test('mentor history and chat_id are persisted; in-flight state never restores as loading', async () => {
  const key = createAgentConversationKey('mentor', 'course', 'lesson');
  const store = useAgentStore.getState();
  store.initializeConversation({ key, courseId: 'course', agent: 'mentor' });
  store.appendMessage(key, 'user', 'Explain this');
  store.appendMessage(key, 'assistant', 'Saved explanation');
  store.setChatId(key, 'saved-chat-id');
  useAgentStore.setState((state) => ({
    conversations: {
      ...state.conversations,
      [key]: {
        ...state.conversations[key],
        status: 'loading',
        activeRequestId: 123,
      },
    },
  }));
  await useAgentStore.persist.rehydrate();
  assert.equal(
    useAgentStore.getState().conversations[key].chatId,
    'saved-chat-id',
  );
  assert.equal(useAgentStore.getState().conversations[key].messages.length, 2);
  assert.equal(useAgentStore.getState().conversations[key].status, 'error');
  assert.equal(
    useAgentStore.getState().conversations[key].activeRequestId,
    null,
  );
  useSessionStore.setState({ user: { id: 'other-student' } });
  assert.notEqual(
    createAgentConversationKey('mentor', 'course', 'lesson'),
    key,
  );
  assert.equal(calls.length, 0);
});

void test('editor drafts restore and clear only for the current account', async () => {
  const draft = {
    kind: 'lesson' as const,
    courseId: 'course',
    entityId: 'lesson',
    entity: { title: 'Old' },
    changes: { title: 'Draft' },
  };
  useEditorDraftStore.getState().recordEdit(draft);
  const key = draftKey('lesson', 'lesson');
  await useEditorDraftStore.persist.rehydrate();
  assert.equal(
    useEditorDraftStore.getState().edits[key].changes.title,
    'Draft',
  );
  useSessionStore.setState({ user: { id: 'other-student' } });
  assert.equal(
    useEditorDraftStore.getState().getCourseEdits('course').length,
    0,
  );
  useEditorDraftStore.getState().clearCourse('course');
  useSessionStore.setState({ user: { id: 'student-a' } });
  assert.equal(
    useEditorDraftStore.getState().getCourseEdits('course').length,
    1,
  );
  useEditorDraftStore.getState().clearCourse('course');
  assert.equal(
    useEditorDraftStore.getState().getCourseEdits('course').length,
    0,
  );
});

void test('binary files round-trip through IndexedDB and are removed independently', async () => {
  const file = new File(['saved solution'], 'solution.py', {
    type: 'text/plain',
  });
  await writeStoredFiles('files-a', [{ file, name: file.name }]);
  const restored = await readStoredFiles<{ file: Blob; name: string }>(
    'files-a',
  );
  assert.equal(restored[0].name, 'solution.py');
  assert.equal(await restored[0].file.text(), 'saved solution');
  assert.deepEqual(await readStoredFiles('files-b'), []);
  await writeStoredFiles('files-a', []);
  assert.deepEqual(await readStoredFiles('files-a'), []);
});

void test('generation job keys are scoped and task identity survives hydration', async () => {
  const key = generationJobKey('module', 'course');
  useGenerationJobsStore.getState().startJob({
    key,
    kind: 'module',
    courseId: 'course',
    taskId: 'task-saved',
  });
  await useGenerationJobsStore.persist.rehydrate();
  assert.equal(
    useGenerationJobsStore.getState().getJob(key)?.taskId,
    'task-saved',
  );
  useSessionStore.setState({ user: { id: 'other-student' } });
  assert.equal(
    useGenerationJobsStore
      .getState()
      .getJob(generationJobKey('module', 'course')),
    null,
  );
});

void test('local drafts recover from malformed JSON and incompatible saved data', async () => {
  function Draft({ name }: { name: string }) {
    const [value] = useLocalState(name, 'initial');
    return <span>{value}</span>;
  }
  storage.setItem('broken-json', '{');
  storage.setItem(
    'broken-shape',
    JSON.stringify({ version: 1, state: { value: {} } }),
  );
  for (const name of ['broken-json', 'broken-shape']) {
    const page = await render(<Draft name={name} />);
    assert.match(JSON.stringify(page.toJSON()), /initial/);
    await unmount(page);
  }
});

void test('quota errors keep the current answer usable and report a warning instead of throwing', async () => {
  let warnings = 0;
  events.addEventListener('local-state-save-error', () => {
    warnings += 1;
  });
  function Draft() {
    const [value, setValue] = useLocalState('quota-test', 'before');
    return <button onClick={() => setValue('after')}>{value}</button>;
  }
  const page = await render(<Draft />);
  storage.failWrites = true;
  await click(button(page, 'before'));
  assert.match(JSON.stringify(page.toJSON()), /after/);
  assert.equal(warnings, 1);
  storage.failWrites = false;
  await unmount(page);
});

void test('uploaded solution restores with its filename and is checked without regenerating', async () => {
  const key = assessmentKey('file-restored');
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      state: {
        value: {
          test: null,
          assignment: { title: 'File practice', allowed_extensions: ['.py'] },
          practiceId: 'file-id',
          answers: {},
          questionIndex: 0,
          solution: '',
          entryMode: 'file',
          result: null,
          operation: null,
          error: '',
        },
      },
    }),
  );
  await writeStoredFiles(key, [
    {
      data: new Blob(['print(1)'], { type: 'text/plain' }),
      name: 'saved.py',
      lastModified: 123,
    },
  ]);
  responder = async (url, options) => {
    if (url.includes('/lessons/'))
      return Response.json({ id: 'file-restored', title: 'Current lesson' });
    assert.match(url, /agent\/check\/practices\/file-id/);
    const form = options?.body as FormData;
    const file = form.get('file') as File;
    assert.equal(file.name, 'saved.py');
    assert.equal(await file.text(), 'print(1)');
    return Response.json({ score: 100, ai_feedback: 'File checked' });
  };
  const page = await render(
    <LessonPracticeAgent moduleId="module" lessonId="file-restored" />,
  );
  assert.match(JSON.stringify(page.toJSON()), /saved.py/);
  await click(button(page, 'Проверить решение'));
  assert.match(JSON.stringify(page.toJSON()), /File checked/);
  assert.equal(calls.length, 2);
  await unmount(page);
});

void test('creator retains the same conversation, brief and input when leaving and returning', async () => {
  useSessionStore.setState({ user: { id: 'creator-test' } });
  responder = (url) => {
    assert.match(url, /agent\/interviewer/);
    return Response.json({
      content: 'What is your goal?',
      chat_id: 'creator-chat',
    });
  };
  const element = (
    <MemoryRouter>
      <CreatorChatView />
    </MemoryRouter>
  );
  let page = await render(element);
  act(() => {
    (
      page.root.findByType('textarea').props.onChange as (
        event: unknown,
      ) => void
    )({ target: { value: 'Python course' } });
  });
  const activeKey = `creator-active:${getPersistenceScope()}`;
  const activeId = storage.getItem(activeKey);
  assert.ok(activeId);
  const send = page.root
    .findAllByType('button')
    .find((item) => item.props['aria-label'] === 'Отправить')!;
  await click(send);
  act(() => {
    (
      page.root.findByType('textarea').props.onChange as (
        event: unknown,
      ) => void
    )({ target: { value: 'Unsent goal' } });
  });
  await unmount(page);
  page = await render(element);
  assert.equal(storage.getItem(activeKey), activeId);
  assert.equal(page.root.findByType('textarea').props.value, 'Unsent goal');
  assert.match(JSON.stringify(page.toJSON()), /Python course/);
  assert.equal(calls.length, 1);
  await unmount(page);
});

void test('catalog restores filters from the URL without changing API calls', async () => {
  const page = await render(
    <MemoryRouter
      initialEntries={['/courses?q=Python&level=beginner&topic=python']}
    >
      <CourseCatalog
        coursesData={[]}
        openCourse={() => {}}
        openCreator={() => {}}
        canReadCourse
      />
    </MemoryRouter>,
  );
  const input = page.root.findAllByType('input')[0];
  assert.equal(input.props.value, 'Python');
  const selects = page.root.findAllByType('select');
  assert.equal(selects[0].props.value, 'beginner');
  assert.equal(selects[1].props.value, 'python');
  assert.equal(calls.length, 0);
  await unmount(page);
});

const editorCourse = 'editor-course';
const editorBlocks = [
  { content_type: 'text', md_content: 'Original first block' },
  { content_type: 'text', md_content: 'Original second block' },
];
function editorInput(page: ReactTestRenderer) {
  return page.root
    .findAllByType('textarea')
    .find((item) => item.props['aria-label'] === 'Сообщение ИИ-редактору')!;
}
async function openEditor(page: ReactTestRenderer) {
  const preview = page.root.findAll(
    (item) =>
      typeof item.props['aria-label'] === 'string' &&
      item.props['aria-label'].startsWith('Редактировать блок 1:'),
  )[0];
  await click(preview);
  await click(button(page, 'ИИ-редактор'));
}
async function editorProposal(lessonId: string) {
  responder = (url) => {
    assert.match(url, /agent\/editor$/);
    return Response.json({
      chat_id: 'local-editor-chat',
      content: JSON.stringify({ md_content: 'Proposed first block' }),
    });
  };
  const page = await render(
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: lessonId, contentBlocks: editorBlocks }}
      onChange={() => {}}
    />,
  );
  await openEditor(page);
  act(() => {
    (editorInput(page).props.onChange as (event: unknown) => void)({
      target: { value: 'Improve this block' },
    });
  });
  const send = page.root
    .findAllByType('button')
    .find((item) => item.props['aria-label'] === 'Отправить сообщение')!;
  await click(send);
  assert.match(JSON.stringify(page.toJSON()), /Предложено ИИ/);
  return page;
}

void test('AI editor restores an unsent prompt and open panel without making a request', async () => {
  const element = (
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: 'editor-draft', contentBlocks: editorBlocks }}
      onChange={() => {}}
    />
  );
  let page = await render(element);
  await openEditor(page);
  act(() => {
    (editorInput(page).props.onChange as (event: unknown) => void)({
      target: { value: 'Unsent editor prompt' },
    });
  });
  await unmount(page);
  page = await render(element);
  assert.equal(editorInput(page).props.value, 'Unsent editor prompt');
  assert.equal(calls.length, 0);
  await unmount(page);
});

void test('AI proposal restores after UI ids change and applies to its original block', async () => {
  let page = await editorProposal('editor-proposal');
  await unmount(page);
  let change: LessonContentChange | undefined;
  page = await render(
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: 'editor-proposal', contentBlocks: editorBlocks }}
      onChange={(value) => {
        change = value;
      }}
    />,
  );
  assert.match(JSON.stringify(page.toJSON()), /Предложено ИИ/);
  assert.equal(calls.length, 1);
  await click(button(page, 'Применить'));
  assert.equal(change?.contentBlocks[0].md_content, 'Proposed first block');
  assert.equal(change?.contentBlocks[1].md_content, 'Original second block');
  await unmount(page);
  page = await render(
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: 'editor-proposal', contentBlocks: change?.contentBlocks }}
      onChange={() => {}}
    />,
  );
  assert.doesNotMatch(JSON.stringify(page.toJSON()), /Предложено ИИ/);
  assert.equal(calls.length, 1);
  await unmount(page);
});

void test('AI proposal is retained but cannot apply to modified content', async () => {
  let page = await editorProposal('editor-stale');
  await unmount(page);
  page = await render(
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{
        id: 'editor-stale',
        contentBlocks: [
          { content_type: 'text', md_content: 'New server version' },
          editorBlocks[1],
        ],
      }}
      onChange={() => {
        assert.fail('Stale proposal must not be applied');
      }}
    />,
  );
  assert.match(JSON.stringify(page.toJSON()), /Блок изменился/);
  assert.match(JSON.stringify(page.toJSON()), /Proposed first block/);
  assert.equal(
    page.root
      .findAllByType('button')
      .some((item) => item.children.includes('Применить')),
    false,
  );
  assert.equal(calls.length, 1);
  await click(button(page, 'Удалить сохранённую правку'));
  await unmount(page);
  page = await render(
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: 'editor-stale', contentBlocks: editorBlocks }}
      onChange={() => {}}
    />,
  );
  assert.doesNotMatch(JSON.stringify(page.toJSON()), /Предложено ИИ/);
  await unmount(page);
});

void test('AI editor restores reference images from IndexedDB without persisting blob URLs', async () => {
  const images = [{ content_type: 'image', image_id: '' }];
  let page = await render(
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: 'editor-image', contentBlocks: images }}
      onChange={() => {}}
    />,
  );
  await openEditor(page);
  const fileInput = page.root
    .findAllByType('input')
    .find((item) => item.props.accept === 'image/*')!;
  const file = new File(['reference pixels'], 'reference.png', {
    type: 'image/png',
    lastModified: 123,
  });
  await act(async () => {
    (fileInput.props.onChange as (event: unknown) => void)({
      target: { files: [file], value: 'reference.png' },
    });
    await tick();
  });
  const key = `ai-editor-draft:${getPersistenceScope()}:${editorCourse}:editor-image`;
  const saved = storage.getItem(key)!;
  const files = await readStoredFiles(`${key}:references`);
  assert.equal(files.length, 1);
  assert.doesNotMatch(saved, /blob:/);
  await unmount(page);
  const restoredKey = `ai-editor-draft:${getPersistenceScope()}:${editorCourse}:editor-image-restored`;
  storage.setItem(restoredKey, saved);
  await writeStoredFiles(`${restoredKey}:references`, files);
  page = await render(
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: 'editor-image-restored', contentBlocks: images }}
      onChange={() => {}}
    />,
  );
  assert.match(JSON.stringify(page.toJSON()), /reference.png/);
  assert.equal(calls.length, 0);
  await unmount(page);
});

void test('AI editor saves a late proposal after leaving the page and keeps it account-scoped', async () => {
  let resolve!: (response: Response) => void;
  responder = () =>
    new Promise<Response>((done) => {
      resolve = done;
    });
  const element = (
    <LessonContentEditor
      courseId={editorCourse}
      lesson={{ id: 'editor-late', contentBlocks: editorBlocks }}
      onChange={() => {}}
    />
  );
  let page = await render(element);
  await openEditor(page);
  act(() => {
    (editorInput(page).props.onChange as (event: unknown) => void)({
      target: { value: 'Late editor prompt' },
    });
  });
  const send = page.root
    .findAllByType('button')
    .find((item) => item.props['aria-label'] === 'Отправить сообщение')!;
  let request!: Promise<void>;
  act(() => {
    request = (send.props.onClick as () => Promise<void>)();
  });
  await unmount(page);
  await act(async () => {
    resolve(
      Response.json({
        chat_id: 'late-editor-chat',
        content: JSON.stringify({ md_content: 'Late saved proposal' }),
      }),
    );
    await request;
  });
  page = await render(element);
  assert.match(JSON.stringify(page.toJSON()), /Late saved proposal/);
  assert.equal(calls.length, 1);
  act(() => {
    useSessionStore.setState({ user: { id: 'another-editor-user' } });
  });
  assert.doesNotMatch(JSON.stringify(page.toJSON()), /Late saved proposal/);
  await unmount(page);
});

void test('forced refresh bypasses course, module, lesson and theory caches', async () => {
  const courseId = '40000000-0000-4000-8000-000000000001';
  const moduleId = '40000000-0000-4000-8000-000000000002';
  const lessonId = '40000000-0000-4000-8000-000000000003';
  let version = 'Old';
  const requestModes: (RequestCache | undefined)[] = [];
  responder = (url, options) => {
    requestModes.push(options?.cache);
    if (url.endsWith(`/courses/${courseId}`))
      return Response.json({
        id: courseId,
        title: `${version} course`,
        modules: [{ id: moduleId }],
      });
    if (url.endsWith(`/modules/${moduleId}`))
      return Response.json({
        id: moduleId,
        title: `${version} module`,
        lessons: [{ id: lessonId, title: `${version} lesson` }],
      });
    if (url.endsWith(`/lessons/${lessonId}/theory`))
      return Response.json([
        { content_type: 'text', md_content: `${version} theory` },
      ]);
    if (url.endsWith(`/lessons/${lessonId}`))
      return Response.json({ id: lessonId, title: `${version} lesson` });
    assert.fail(`Unexpected request: ${url}`);
  };
  await getCourseLearningStructure(courseId, true);
  await getLessonById(lessonId, true);
  await getLessonContentBlocks(lessonId, true);
  const count = calls.length;
  version = 'New';
  assert.equal(
    (await getCourseLearningStructure(courseId)).title,
    'Old course',
  );
  assert.equal((await getLessonById(lessonId)).title, 'Old lesson');
  assert.equal(
    (await getLessonContentBlocks(lessonId))[0].md_content,
    'Old theory',
  );
  assert.equal(calls.length, count);
  const current = await getCourseLearningStructure(courseId, true);
  assert.equal(current.title, 'New course');
  assert.equal(current.blocks[0].title, 'New module');
  assert.equal((await getLessonById(lessonId, true)).title, 'New lesson');
  assert.equal(
    (await getLessonContentBlocks(lessonId, true))[0].md_content,
    'New theory',
  );
  assert.ok(requestModes.every((mode) => mode === 'no-store'));
  assert.equal(
    calls.some((url) => url.includes('/agent/')),
    false,
  );
});

void test('return refresh responds to visible focus, visibility and online, and cleans up listeners', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const originalNow = Date.now;
  let time = 1000;
  Date.now = () => time;
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: doc,
  });
  function Revision() {
    return <span>{useRefreshOnReturn()}</span>;
  }
  let page: ReactTestRenderer | undefined;
  try {
    page = await render(<Revision />);
    assert.deepEqual(page.toJSON() && page.root.findByType('span').children, [
      '0',
    ]);
    act(() => {
      events.dispatchEvent(new Event('focus'));
      doc.dispatchEvent(new Event('visibilitychange'));
    });
    assert.deepEqual(page.root.findByType('span').children, ['1']);
    time += 500;
    doc.visibilityState = 'hidden';
    act(() => {
      doc.dispatchEvent(new Event('visibilitychange'));
      events.dispatchEvent(new Event('focus'));
    });
    assert.deepEqual(page.root.findByType('span').children, ['1']);
    doc.visibilityState = 'visible';
    act(() => {
      doc.dispatchEvent(new Event('visibilitychange'));
    });
    assert.deepEqual(page.root.findByType('span').children, ['2']);
    act(() => {
      events.dispatchEvent(new Event('online'));
    });
    assert.deepEqual(page.root.findByType('span').children, ['3']);
  } finally {
    if (page) await unmount(page);
    Date.now = originalNow;
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

void test('lesson preflight blocks a paid check on 404 and retains the typed solution', async () => {
  const element = (
    <LessonPracticeAgent moduleId="module" lessonId="preflight" />
  );
  let page = await render(element);
  await click(button(page, 'Подготовить задание'));
  act(() => {
    (
      page.root.findByType('textarea').props.onChange as (
        event: unknown,
      ) => void
    )({ target: { value: 'Keep my solution' } });
  });
  responder = (url) => {
    assert.match(url, /\/lessons\/preflight$/);
    return Response.json({ detail: 'Lesson removed' }, { status: 404 });
  };
  await click(button(page, 'Проверить решение'));
  assert.equal(
    calls.some((url) => url.includes('/agent/check/')),
    false,
  );
  assert.equal(
    page.root.findByType('textarea').props.value,
    'Keep my solution',
  );
  assert.match(JSON.stringify(page.toJSON()), /Урок или модуль не найден/);
  await unmount(page);
  page = await render(element);
  assert.equal(
    page.root.findByType('textarea').props.value,
    'Keep my solution',
  );
  assert.equal(
    calls.filter((url) => url.includes('/agent/practices/')).length,
    1,
  );
  await unmount(page);
});
