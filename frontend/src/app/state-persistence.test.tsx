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
import { useState, type ReactElement } from 'react';
import { EmailRowsField, useEmailRows } from '@/features/invite';
import { PageLoadBoundary } from '@/app/router';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { apiFetch, requestJson } from '@/shared/api';
import { fetchModelsPage } from '@/entities/ai-model';
import {
  getCourseLearningStructure,
  getLessonById,
  getLessonContentBlocks,
  forgetLessonTheory,
  useStudentStore,
  getSelectedCourse,
  getRouteState,
  EMPTY_COURSE,
} from '@/entities/course';
import { CourseViewer } from '@/pages/course-view';
import { useCourseProgress } from '@/features/course-progress';
import { useRefreshOnReturn } from '@/shared/lib/use-refresh-on-return';
import { CreatorChatView } from '@/features/create-course-chat';
import { CourseCatalog } from '@/widgets/course-catalog';
import { CourseNavigationTree } from '@/entities/course';
import { useUiLayoutStore } from '@/shared/lib/ui-layout';
import { Select } from '@/shared/ui/select';
import {
  LessonContentEditor,
  type LessonContentChange,
} from '@/features/edit-lesson-content';
import {
  useSessionStore,
  usePermissionStore,
  COURSE_PERMISSIONS,
  getPersistenceScope,
} from '@/entities/session';
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
    if (url.includes('/agents/check/'))
      return Response.json({ score: 95, ai_feedback: 'Решение верное' });
    if (url.includes('/agents/practices/'))
      return Response.json({
        practice_id: 'practice-mock',
        practice: { title: 'Mock practice', allowed_extensions: ['.py'] },
      });
    if (url.includes('/agents/tests/'))
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
    assert.match(url, /agents\/check\/practices\/file-id/);
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
    assert.match(url, /agents\/courses\/interviewer\//);
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
  const selects = page.root.findAllByType(Select);
  assert.equal(selects[0].props.value, 'beginner');
  assert.equal(selects[1].props.value, 'python');
  act(() => {
    (selects[0].props.onChange as (value: string) => void)('advanced');
  });
  assert.equal(page.root.findAllByType(Select)[0].props.value, 'advanced');
  assert.equal(page.root.findAllByType(Select)[1].props.value, 'python');
  assert.equal(calls.length, 0);
  await unmount(page);
});

void test('training tree shares scoped lesson tabs and keeps other accounts separate', async () => {
  const lessonId = 'local-training-lesson';
  const tree = (scope: string) => (
    <CourseNavigationTree
      lessonTabScope={scope}
      selectedCourse={{
        title: 'Training',
        blocks: [{ id: 'module', lessons: [{ id: lessonId }], practice: [] }],
      }}
      selectedBlock={{ id: 'module' }}
      selectedLessonId={lessonId}
      completedLessons={{}}
      completedPractices={{}}
      openBlock={() => {}}
      openLesson={() => {}}
      openPractice={() => {}}
    />
  );
  let page = await render(tree('account-a'));
  await click(page.root.findByProps({ 'aria-label': 'Проверочные вопросы' }));
  assert.equal(
    useUiLayoutStore.getState().getLessonActiveTab(`account-a:${lessonId}`),
    'questions',
  );
  assert.equal(
    useUiLayoutStore.getState().getLessonActiveTab(`account-b:${lessonId}`),
    'theory',
  );
  assert.equal(
    useUiLayoutStore.getState().getLessonActiveTab(lessonId),
    'theory',
  );
  await unmount(page);
  page = await render(tree('account-a'));
  assert.equal(
    page.root.findByProps({ 'aria-label': 'Проверочные вопросы' }).props[
      'aria-pressed'
    ],
    true,
  );
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
    assert.match(url, /agents\/editor\/editor-course$/);
    return Response.json({
      chat_id: 'local-editor-chat',
      content: {
        content_type: 'text',
        md_content: 'Proposed first block',
        ai_generated: true,
      },
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

void test('concurrent GET consumers share a request and get independently readable response bodies', async () => {
  let release!: (response: Response) => void;
  responder = () =>
    new Promise<Response>((resolve) => {
      release = resolve;
    });
  const first = requestJson('/audit-read', {}, { auth: false });
  const second = requestJson('/audit-read', {}, { auth: false });
  assert.equal(calls.length, 1);
  release(Response.json({ title: 'Fresh' }));
  assert.deepEqual(await Promise.all([first, second]), [
    { title: 'Fresh' },
    { title: 'Fresh' },
  ]);
  responder = () => Response.json({ title: 'Updated' });
  assert.deepEqual(await requestJson('/audit-read', {}, { auth: false }), {
    title: 'Updated',
  });
  assert.equal(
    calls.length,
    2,
    'completed reads must not suppress later refreshes',
  );
  await Promise.all([
    requestJson(
      '/audit-write',
      { method: 'POST', body: '{}' },
      { auth: false },
    ),
    requestJson(
      '/audit-write',
      { method: 'POST', body: '{}' },
      { auth: false },
    ),
  ]);
  assert.equal(calls.length, 4, 'writes must never be combined');
});

void test('shared GET requests isolate authorization, cancellation and failures', async () => {
  responder = () => Response.json({ ok: true });
  await Promise.all([
    apiFetch(
      '/audit-scope',
      { headers: { Authorization: 'Bearer synthetic-a' } },
      { auth: false },
    ),
    apiFetch(
      '/audit-scope',
      { headers: { Authorization: 'Bearer synthetic-b' } },
      { auth: false },
    ),
  ]);
  assert.equal(calls.length, 2);
  const controller = new AbortController();
  let finishIndependent!: (response: Response) => void;
  responder = (_url, options) =>
    new Promise<Response>((resolve, reject) => {
      if (options?.signal) {
        options.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          { once: true },
        );
      } else finishIndependent = resolve;
    });
  const cancelled = apiFetch(
    '/audit-abort',
    { signal: controller.signal },
    { auth: false },
  );
  const independent = apiFetch('/audit-abort', {}, { auth: false });
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  finishIndependent(Response.json({ ok: true }));
  assert.deepEqual(await (await independent).json(), { ok: true });
  responder = () => Promise.reject(new Error('Offline'));
  await assert.rejects(
    requestJson('/audit-retry', {}, { auth: false }),
    /Offline/,
  );
  responder = () => Response.json({ ok: true });
  assert.deepEqual(await requestJson('/audit-retry', {}, { auth: false }), {
    ok: true,
  });
});

void test('model list uses the current API, shares concurrent searches and maps backend ids', async () => {
  responder = () =>
    Response.json({
      items: [{ id: 'model-id', name: 'Synthetic model' }],
      total: 1,
      pages: 1,
    });
  const [first, second] = await Promise.all([
    fetchModelsPage(),
    fetchModelsPage(),
  ]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('/ai-models/search'));
  assert.equal(first.items[0].uid, 'model-id');
  assert.deepEqual(first, second);
});

void test('course structure shares active requests, loads modules concurrently and preserves order', async () => {
  const courseId = '50000000-0000-4000-8000-000000000001';
  const moduleIds = Array.from(
    { length: 8 },
    (_, index) => `module-concurrent-${index}`,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0;
  let peak = 0;
  responder = async (url) => {
    if (url.endsWith(`/courses/${courseId}`)) {
      return Response.json({
        id: courseId,
        modules: moduleIds.map((id) => ({ id })),
      });
    }
    const id = url.split('/').pop()!;
    assert.ok(moduleIds.includes(id));
    active += 1;
    peak = Math.max(peak, active);
    await gate;
    active -= 1;
    return Response.json({ id, title: id, lessons: [] });
  };
  const first = getCourseLearningStructure(courseId, true);
  const second = getCourseLearningStructure(courseId, true);
  try {
    await tick();
    assert.equal(
      active,
      6,
      'independent module reads must start before their siblings finish',
    );
    assert.equal(
      calls.filter((url) => url.endsWith(`/courses/${courseId}`)).length,
      1,
    );
  } finally {
    release();
  }
  const courses = await Promise.all([first, second]);
  assert.equal(peak, 6);
  assert.equal(
    calls.length,
    9,
    'one course and one request per module for both consumers',
  );
  for (const course of courses) {
    assert.deepEqual(
      course.blocks.map((block) => block.id),
      moduleIds,
    );
  }
});

void test('a failed shared theory request can be retried', async () => {
  const lessonId = 'failed-theory-request';
  responder = () => Promise.reject(new Error('Connection interrupted'));
  await assert.rejects(
    Promise.all([
      getLessonContentBlocks(lessonId, true),
      getLessonContentBlocks(lessonId, true),
    ]),
    /Connection interrupted/,
  );
  assert.equal(calls.length, 1);
  responder = () =>
    Response.json([{ content_type: 'text', md_content: 'Recovered' }]);
  assert.equal(
    (await getLessonContentBlocks(lessonId, true))[0].md_content,
    'Recovered',
  );
  assert.equal(calls.length, 2);
});

void test('invalidating theory prevents an older in-flight response from replacing saved content', async () => {
  const lessonId = 'invalidated-theory-request';
  let release!: (response: Response) => void;
  responder = () =>
    new Promise<Response>((resolve) => {
      release = resolve;
    });
  const oldRequest = getLessonContentBlocks(lessonId, true);
  forgetLessonTheory(lessonId);
  responder = () =>
    Response.json([{ content_type: 'text', md_content: 'New content' }]);
  await getLessonContentBlocks(lessonId, true);
  release(Response.json([{ content_type: 'text', md_content: 'Old content' }]));
  await oldRequest;
  assert.equal(
    (await getLessonContentBlocks(lessonId))[0].md_content,
    'New content',
  );
});

void test('deep lesson reload requests theory immediately and ignores changes to the separate editor tree', async () => {
  const courseId = '60000000-0000-4000-8000-000000000001';
  const moduleId = '60000000-0000-4000-8000-000000000002';
  const lessonId = '60000000-0000-4000-8000-000000000003';
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const originalPermissions = usePermissionStore.getState().permissions;
  const originalMatchMedia = Object.getOwnPropertyDescriptor(
    window,
    'matchMedia',
  );
  Object.assign(window, {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      visibilityState: 'hidden',
      hidden: true,
      documentElement: { clientWidth: 1440, dataset: {} },
    }),
  });
  usePermissionStore
    .getState()
    .setPermissions([COURSE_PERMISSIONS.COURSE_READ]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  responder = async (url) => {
    if (url.endsWith(`/courses/${courseId}`)) {
      return Response.json({ id: courseId, modules: [{ id: moduleId }] });
    }
    if (url.endsWith(`/modules/${moduleId}`)) {
      await gate;
      return Response.json({ id: moduleId, lessons: [{ id: lessonId }] });
    }
    if (url.endsWith(`/lessons/${lessonId}/theory`)) return Response.json([]);
    if (url.endsWith(`/lessons/${lessonId}`))
      return Response.json({ id: lessonId });
    if (url.includes('/members?')) return Response.json({ items: [] });
    if (url.endsWith('/courses/my-courses')) {
      return Response.json({
        items: [{ id: courseId, creatorId: 'student-a' }],
      });
    }
    if (url.includes('/progress/theory-sessions/'))
      return Response.json({ id: 'synthetic-session' });
    assert.fail(`Unexpected request: ${url}`);
  };
  const element = (title: string) => (
    <MemoryRouter initialEntries={[`/course/${courseId}/lesson/${lessonId}`]}>
      <Routes>
        <Route
          path="/course/:courseId/lesson/:lessonId"
          element={
            <CourseViewer localCourse={{ id: courseId, title, blocks: [] }} />
          }
        />
      </Routes>
    </MemoryRouter>
  );
  let page: ReactTestRenderer | undefined;
  try {
    page = await render(element('Editor tree before its own fetch'));
    assert.equal(
      calls.filter((url) => url.endsWith(`/lessons/${lessonId}/theory`)).length,
      1,
    );
    release();
    await act(tick);
    await act(tick);
    assert.equal(
      page.root.findAll(
        (node) => node.props.className === 'lesson-theory-content',
      ).length,
      1,
      'an author must see their own lesson even when they are not enrolled and the catalogue was not loaded',
    );
    assert.equal(useStudentStore.getState().isCourseEnrolled(courseId), false);
    assert.equal(
      calls.filter((url) => url.endsWith('/courses/my-courses')).length,
      1,
    );
    await act(async () => {
      page!.update(element('Editor tree updated'));
      await tick();
    });
    assert.equal(
      calls.filter((url) => url.endsWith(`/courses/${courseId}`)).length,
      1,
    );
    assert.equal(calls.filter((url) => url.includes('/members?')).length, 1);
    assert.equal(
      calls.filter((url) => url.endsWith(`/lessons/${lessonId}/theory`)).length,
      1,
    );
  } finally {
    if (page) await unmount(page);
    release();
    await tick();
    usePermissionStore.getState().setPermissions(originalPermissions);
    if (originalMatchMedia)
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

void test('failed page loading shows recovery controls and permits navigation without remounting healthy pages', async () => {
  let mounts = 0;
  function Page({ fail }: { fail: boolean }) {
    useState(() => {
      mounts += 1;
      return null;
    });
    if (fail) throw new Error('Synthetic chunk download failure');
    return <p>Page content</p>;
  }
  const page = await render(
    <PageLoadBoundary pathname="/course/one/lesson/one">
      <Page fail={false} />
    </PageLoadBoundary>,
  );
  const originalError = console.error;
  try {
    await act(async () => {
      page.update(
        <PageLoadBoundary pathname="/course/one/lesson/two">
          <Page fail={false} />
        </PageLoadBoundary>,
      );
      await tick();
    });
    assert.equal(
      mounts,
      1,
      'ordinary route changes must preserve the mounted viewer',
    );
    console.error = () => {};
    await act(async () => {
      page.update(
        <PageLoadBoundary pathname="/broken">
          <Page fail={true} />
        </PageLoadBoundary>,
      );
      await tick();
    });
    assert.equal(
      page.root.findByProps({ role: 'alert' }).findAllByType('button').length,
      1,
    );
    await act(async () => {
      page.update(
        <PageLoadBoundary pathname="/courses">
          <Page fail={false} />
        </PageLoadBoundary>,
      );
      await tick();
    });
    assert.deepEqual(page.root.findByType('p').children, ['Page content']);
  } finally {
    console.error = originalError;
    await unmount(page);
  }
});

void test('leaving the invitation email field keeps layout stable and sends the draft with the chosen role once', async () => {
  const sent: Array<{ email: string; role: string }> = [];
  responder = () => Response.json({ items: [] });
  function Probe() {
    const emails = useEmailRows();
    const [role, setRole] = useState('student');
    return (
      <>
        <EmailRowsField id="invite-email" emails={emails} />
        <span>{emails.rows.length}</span>
        <button onClick={() => setRole('teacher')}>Choose teacher</button>
        <button
          onClick={() =>
            emails.sendAll(
              (email) => {
                sent.push({ email, role });
                return Promise.resolve();
              },
              () => 'Failed',
            )
          }
        >
          Send invite
        </button>
      </>
    );
  }
  const page = await render(<Probe />);
  try {
    const input = page.root.findByType('input');
    await act(async () => {
      (input.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: 'learner@example.test' },
      });
      await tick();
    });
    await act(async () => {
      (input.props.onBlur as (() => void) | undefined)?.();
      await tick();
    });
    assert.equal(input.props.value, 'learner@example.test');
    assert.equal(
      page.root.findAllByType('li').length,
      0,
      'blur must not insert a row and move the role cards under the pointer',
    );
    await click(button(page, 'Choose teacher'));
    await click(button(page, 'Send invite'));
    assert.deepEqual(sent, [
      { email: 'learner@example.test', role: 'teacher' },
    ]);
  } finally {
    await unmount(page);
  }
});

void test('an explicit course route never edits the first cached course while its own data is missing', () => {
  const first = { id: 'first-course', title: 'First course', blocks: [] };
  const second = {
    id: 'requested-course',
    title: 'Requested course',
    blocks: [],
  };
  const route = '/course/requested-course/edit';
  const selectedId = getRouteState(route, [first]).courseId;
  assert.equal(selectedId, second.id);
  assert.equal(getSelectedCourse([first], selectedId), EMPTY_COURSE);
  assert.equal(getSelectedCourse([first, second], selectedId), second);
  assert.equal(getSelectedCourse([first], null), first);
  assert.equal(getSelectedCourse([], selectedId), EMPTY_COURSE);
});

void test('opening a lesson waits for initial progress instead of reading and ensuring it twice', async () => {
  const courseId = '70000000-0000-4000-8000-000000000001';
  const moduleId = '70000000-0000-4000-8000-000000000002';
  const lessonId = '70000000-0000-4000-8000-000000000003';
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lessonProgress = { id: 'existing-progress', lesson_id: lessonId };
  let lessonReads = 0;
  responder = async (url, options) => {
    if (url.endsWith(`/progress/lessons/${lessonId}`)) {
      lessonReads += 1;
      await gate;
      return Response.json(lessonProgress);
    }
    if (url.includes(`/progress/courses/${courseId}`))
      return Response.json({ id: 'course-progress', course_id: courseId });
    if (url.endsWith(`/courses/${courseId}`))
      return Response.json({ id: courseId, modules: [{ id: moduleId }] });
    if (url.endsWith(`/modules/${moduleId}`))
      return Response.json({ id: moduleId, lessons: [{ id: lessonId }] });
    assert.fail(`Unexpected ${options?.method || 'GET'} request: ${url}`);
  };
  let progress!: ReturnType<typeof useCourseProgress>;
  function Probe() {
    progress = useCourseProgress(courseId);
    return null;
  }
  const page = await render(<Probe />);
  let tracked = false;
  const tracking = progress.trackLesson(moduleId, lessonId).then((result) => {
    tracked = true;
    return result;
  });
  try {
    await tick();
    assert.equal(lessonReads, 1);
    assert.equal(
      tracked,
      false,
      'tracking must wait for the existing course read',
    );
    await act(async () => {
      release();
      await tracking;
      await tick();
    });
    assert.equal((await tracking)?.id, 'existing-progress');
    assert.equal(lessonReads, 1);
    assert.equal(
      progress.lessonProgressById[lessonId]?.id,
      'existing-progress',
    );
  } finally {
    release();
    await tracking;
    await unmount(page);
  }
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
    calls.some((url) => url.includes('/agents/')),
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
    calls.some((url) => url.includes('/agents/check/')),
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
    calls.filter((url) => url.includes('/agents/practices/')).length,
    1,
  );
  await unmount(page);
});
