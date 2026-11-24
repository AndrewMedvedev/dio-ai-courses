import {
  createSession,
  updateSession,
} from '../src/entities/progress/api/theory-session-api';
import { extractTaskId } from '../src/entities/agent-chat/lib/agent-chat-utils';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
} from '../src/entities/notification';
import { NotificationsPage } from '../src/pages/notifications';
import { calls, setResponder } from './fixtures/api';
import { createApiError } from '../src/shared/api/api-error';
import { getErrorMessage } from '../src/shared/lib/errors';
import {
  inviteToCourse,
  fetchCourseInvitationsPage,
  revokeCourseInvitation,
  acceptCourseInvitation,
} from '../src/entities/invitation/api/invitation-api';
import {
  createModule,
  createLesson,
  updateModule,
  updateLesson,
  updateLessonContentBlocks,
  assignLessonToModule,
  getGenerationSession,
} from '../src/entities/course/api/course-api';
import {
  askInterviewerAgent,
  askModuleInterviewerAgent,
  askLessonInterviewerAgent,
  askEditorAgent,
  askMentorAgent,
} from '../src/entities/agent-chat/api/agent-api';
import {
  generateLessonTest,
  checkLessonTest,
  generateLessonPractice,
  checkLessonPractice,
} from '../src/features/lesson-assessment/api/assessment-api';
import {
  courseBasicToLearningCourse,
  lessonBasicToLearningLesson,
} from '../src/entities/course/lib/mappers';
const C = '10000000-0000-4000-8000-000000000001';
const M = '20000000-0000-4000-8000-000000000001';
const L = '30000000-0000-4000-8000-000000000001';

void test('notifications pass the unread filter and mark a single notification as read', async () => {
  const signal = new AbortController().signal;
  const notification = {
    id: C,
    title: 'Приглашение на курс',
    message: 'Вас пригласили на курс.',
    type: 'course_invited',
    created_at: '2026-01-01T12:00:00Z',
    data: {},
    read: false,
  };
  setResponder((path, method) => {
    if (method === 'PATCH') return { ...notification, read: true };
    if (path.endsWith('/unread-count')) return { unread_count: null };
    return { items: [notification], total: 1, has_next: false };
  });

  assert.deepEqual((await fetchNotifications(2, true, signal)).items, [
    notification,
  ]);
  assert.deepEqual((await fetchNotifications(1, false, signal, 3)).items, [
    notification,
  ]);
  assert.equal(await fetchUnreadCount(signal), 0);
  assert.equal((await markNotificationRead(C)).read, true);
  assert.deepEqual(
    calls.map(({ path, method }) => [method, path]),
    [
      ['GET', '/notifications?page=2&size=10&unread_only=true'],
      ['GET', '/notifications?page=1&size=3&unread_only=false'],
      ['GET', '/notifications/unread-count'],
      ['PATCH', `/notifications/${C}/read`],
    ],
  );
});

void test('the demo invitation disappears from Unread after marking it as read', () => {
  setResponder(() => assert.fail('Demo notifications must not call the API'));
  const invitation = {
    id: C,
    title: 'Приглашение на курс',
    message: 'Основы работы с ИИ',
    type: 'course_invited',
    read: false,
    created_at: '',
    data: {},
  };
  let readId = '';
  const props = {
    demoItems: [invitation],
    onRead: (id: string) => {
      readId = id;
    },
    onRefresh: () => assert.fail('Demo notifications must not fetch a count'),
  };
  const view = create(createElement(NotificationsPage, props));
  const click = (label: string) => {
    const button = view.root
      .findAllByType('button')
      .find((node) => node.children.includes(label));
    assert.ok(button);
    const onClick = button.props.onClick as () => void;
    act(onClick);
  };
  try {
    click('Непрочитанные');
    assert.equal(view.root.findAllByType('li').length, 1);
    click('Отметить прочитанным');
    assert.equal(readId, C);
    act(() =>
      view.update(
        createElement(NotificationsPage, {
          ...props,
          demoItems: [{ ...invitation, read: true }],
        }),
      ),
    );
    assert.equal(view.root.findAllByType('li').length, 0);
    click('Все');
    assert.equal(view.root.findAllByType('li').length, 1);
    assert.ok(
      view.root
        .findAllByType('button')
        .some((node) => node.children.includes('Прочитано')),
    );
    assert.deepEqual(calls, []);
  } finally {
    act(() => view.unmount());
  }
});

void test('internal response validation under HTTP 400 stays out of user messages and retains diagnostics', async () => {
  const diagnostic =
    "1 validation error for InvitationResponse email Input should be a valid string [type=string_type, input_value=Email('synthetic@example.com'), input_type=Email] For further information visit https://errors.pydantic.dev/2.13/v/string_type";
  const payload = {
    error: {
      grant: 'VALIDATION_ERROR',
      message: diagnostic,
      status: 400,
      details: {},
    },
  };
  const error = await createApiError(
    Response.json(payload, { status: 400 }),
    'Ошибка запроса POST /courses/invitations/example',
  );
  assert.equal(error.status, 400);
  assert.equal(error.isInternalError, true);
  assert.deepEqual(error.payload, payload);
  assert.equal(error.message, error.userMessage);
  assert.doesNotMatch(
    error.userMessage,
    /InvitationResponse|input_value|pydantic|synthetic@/,
  );
  assert.equal(
    getErrorMessage(error, 'Не удалось загрузить приглашения.'),
    'Не удалось загрузить приглашения.',
  );
});

void test('server errors, HTML proxy pages and unknown status fallbacks do not expose implementation details', async () => {
  for (const response of [
    new Response('Traceback (most recent call last): synthetic failure', {
      status: 500,
    }),
    new Response('<html><body>upstream unavailable</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    }),
    Response.json(
      { detail: 'database pool configuration failed' },
      { status: 503 },
    ),
  ]) {
    const error = await createApiError(
      response,
      'Ошибка запроса GET /internal-resource',
    );
    assert.equal(error.isInternalError, true);
    assert.equal(
      error.userMessage,
      'Сервис не смог обработать запрос. Попробуйте позже.',
    );
  }
  const unknown = await createApiError(
    new Response('', { status: 418 }),
    'Ошибка запроса GET /internal-resource',
  );
  assert.doesNotMatch(unknown.userMessage, /GET|internal-resource/);
  const malformed = await createApiError(
    new Response('{', {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
    'Failed',
  );
  assert.equal(malformed.userMessage, 'Некорректный запрос.');
  const method = await createApiError(
    Response.json({ detail: 'Method Not Allowed' }, { status: 405 }),
    'Failed',
  );
  assert.equal(method.userMessage, 'Это действие сейчас недоступно.');
});

void test('explicit public messages and readable business errors remain specific', async () => {
  const maintenance = await createApiError(
    Response.json(
      {
        error: {
          public_message:
            'Идёт обслуживание. Попробуйте через несколько минут.',
          message: 'Internal database failure',
        },
      },
      { status: 503 },
    ),
    'Failed',
  );
  assert.equal(
    maintenance.userMessage,
    'Идёт обслуживание. Попробуйте через несколько минут.',
  );
  assert.equal(
    getErrorMessage(maintenance, 'Не удалось загрузить данные.'),
    maintenance.userMessage,
  );
  const duplicate = await createApiError(
    Response.json(
      {
        error: {
          code: 'ALREADY_EXISTS',
          message: 'Пользователь уже состоит в организации.',
        },
      },
      { status: 409 },
    ),
    'Failed',
  );
  assert.equal(
    duplicate.userMessage,
    'Пользователь уже состоит в организации.',
  );
  assert.equal(duplicate.code, 'ALREADY_EXISTS');
  assert.equal(duplicate.isInternalError, false);
});

void test('request validation explains fields without dumping inputs or Python messages', async () => {
  const error = await createApiError(
    Response.json(
      {
        detail: [
          {
            loc: ['body', 'email'],
            msg: 'value is not a valid email address: An email address must have an @-sign.',
            type: 'value_error',
            input: 'synthetic-invalid',
          },
          {
            loc: ['body', 'password'],
            msg: 'String should have at least 8 characters',
            type: 'string_too_short',
            ctx: { min_length: 8 },
            input: 'synthetic-secret',
          },
          {
            loc: ['body', 'full_name'],
            msg: 'Field required',
            type: 'missing',
          },
        ],
      },
      { status: 422 },
    ),
    'Failed',
  );
  assert.deepEqual(error.validationErrors, {
    email: 'Введите корректный email.',
    password: 'Минимальная длина — 8 символов.',
    full_name: 'Обязательное поле.',
  });
  assert.equal(error.isInternalError, false);
  assert.doesNotMatch(
    error.userMessage,
    /synthetic|body\.|String should|Field required/,
  );
  const responseFailure = await createApiError(
    Response.json(
      {
        detail: [
          {
            loc: ['response', 'email'],
            msg: 'Input should be a valid string',
            type: 'string_type',
          },
        ],
      },
      { status: 422 },
    ),
    'Failed',
  );
  assert.equal(responseFailure.isInternalError, true);
  assert.deepEqual(responseFailure.validationErrors, {});
});

void test('network errors explain connection failures while other contextual errors retain their messages', () => {
  assert.equal(
    getErrorMessage(
      new TypeError('Failed to fetch'),
      'Не удалось загрузить данные.',
    ),
    'Не удалось связаться с сервером. Проверьте соединение.',
  );
  assert.equal(
    getErrorMessage(new Error('Файл недоступен.'), 'Failed'),
    'Файл недоступен.',
  );
});

void test('course invitations use resource URLs, role payloads and camelCase list responses', async () => {
  const invitationId = 'invitation-id';
  const createdAt = '2026-11-17T06:00:00Z';
  const expiresAt = '2026-11-24T06:00:00Z';
  setResponder((path, method) => {
    if (method === 'GET')
      return {
        items: [
          {
            id: invitationId,
            courseId: C,
            email: 'learner@example.test',
            role: 'student',
            userId: null,
            invitedBy: 'synthetic-user',
            createdAt,
            expiresAt,
          },
        ],
        page: 2,
        size: 1,
        total: 3,
        has_next: true,
      };
    return { id: invitationId };
  });
  for (const role of ['student', 'moderator', 'teacher']) {
    await inviteToCourse({ courseId: C, email: 'learner@example.test', role });
    assert.deepEqual(calls.at(-1), {
      path: `/courses/invitations/${C}`,
      method: 'POST',
      body: { email: 'learner@example.test', role },
    });
  }
  const result = await fetchCourseInvitationsPage(C, { page: 2, size: 1 });
  assert.equal(calls.at(-1)?.path, `/courses/invitations/${C}?page=2&size=1`);
  assert.equal(result.page, 2);
  assert.equal(result.size, 1);
  assert.equal(result.total, 3);
  assert.equal(result.hasNext, true);
  assert.equal(result.items[0].course_id, C);
  assert.equal(result.items[0].user_id, null);
  assert.equal(result.items[0].created_at, createdAt);
  assert.equal(result.items[0].expires_at, expiresAt);
  await revokeCourseInvitation(invitationId);
  assert.equal(
    calls.at(-1)?.path,
    `/courses/invitations/revoke/${invitationId}`,
  );
  assert.equal(calls.at(-1)?.method, 'DELETE');
  await acceptCourseInvitation('synthetic/token');
  assert.equal(
    calls.at(-1)?.path,
    '/courses/invitations/accept/synthetic%2Ftoken',
  );
  assert.equal(calls.at(-1)?.method, 'POST');

  const denied = new Error('Not allowed');
  setResponder(() => {
    throw denied;
  });
  await assert.rejects(
    inviteToCourse({
      courseId: C,
      email: 'learner@example.test',
      role: 'student',
    }),
    (error) => error === denied,
  );
});

void test('SGK-054 clients use resource routes, relative positions and camelCase responses', async () => {
  setResponder((path, method, body) => {
    if (method === 'GET' && path === `/courses/${C}`)
      return { id: C, modules: [{ id: M, rank: 'Z', title: 'Module' }] };
    if (method === 'GET' && path === `/modules/${M}`)
      return { id: M, lessons: [{ id: L, rank: 'a', title: 'Lesson' }] };
    if (path.startsWith('/agents/'))
      return {
        chatId: L,
        content: path.includes('editor')
          ? { content_type: 'text', md_content: 'Edited' }
          : 'Answer',
      };
    if (path.startsWith('/generation-sessions/'))
      return { status: 'completed', generationKey: 'course-generation:key' };
    return {
      id: path.startsWith('/modules') ? M : L,
      title: 'Saved',
      learningObjectives: ['Goal'],
      estimatedTimeMinutes: 15,
      contentBlocks: body?.contentBlocks,
    };
  });
  const module = await createModule(C, { title: 'New', order: 1 });
  assert.deepEqual(module.learningObjectives, ['Goal']);
  const creation = calls.find((c) => c.method === 'POST')!;
  assert.equal(creation.path, `/modules/${C}`);
  assert.deepEqual(creation.body.position, { beforeId: M });
  assert.equal('order' in creation.body, false);
  await createLesson({ moduleId: M, title: 'New lesson', order: 1 });
  assert(
    calls.some(
      (c) =>
        c.path === `/lessons/${M}` &&
        c.method === 'POST' &&
        c.body.position?.beforeId === L,
    ),
  );
  await updateLesson(C, L, { title: 'Changed' });
  await updateLessonContentBlocks(L, [
    { content_type: 'text', md_content: 'Theory', ai_generated: false },
  ]);
  assert(
    calls.some(
      (c) =>
        c.path === `/lessons/${L}` &&
        c.method === 'PATCH' &&
        Array.isArray(c.body.contentBlocks),
    ),
  );
  await assignLessonToModule(L, M);
  assert(
    calls.some((c) => c.path === `/lessons/${L}/move` && c.body.moduleId === M),
  );
  const first = await askInterviewerAgent({ courseId: C, content: 'Hello' });
  assert.equal(first.chatId, L);
  assert(!('chat_id' in calls.at(-1)!.body));
  await askInterviewerAgent({ courseId: C, chatId: L, content: 'Next' });
  assert.equal(calls.at(-1)!.body.chat_id, L);
  await askModuleInterviewerAgent({ courseId: C, content: 'Module', order: 1 });
  assert.equal(calls.at(-1)!.path, `/agents/modules/interviewer/${C}`);
  assert.deepEqual(calls.at(-1)!.body.position, { beforeId: M });
  await askLessonInterviewerAgent({
    courseId: C,
    moduleId: M,
    content: 'Lesson',
    order: 1,
  });
  assert.equal(calls.at(-1)!.body.position?.beforeId, L);
  const edited = await askEditorAgent({
    courseId: C,
    content: 'Edit',
    content_block: { content_type: 'text', md_content: 'Old' },
  });
  assert.equal(typeof calls.at(-1)!.body.content_block, 'string');
  assert.equal(
    (edited.parsedContent as { md_content: string }).md_content,
    'Edited',
  );
  await askMentorAgent({ courseId: C, content: 'Explain' });
  assert.equal(calls.at(-1)!.path, `/agents/mentor/${C}`);
  await generateLessonTest(M, L);
  await checkLessonTest(L, { practice: {}, answers: {} });
  await generateLessonPractice(M, L);
  await checkLessonPractice(L, {}, new Blob(['solution']));
  assert.equal(calls.at(-1)!.path, `/agents/check/practices/${L}`);
  assert(calls.at(-1)!.body instanceof FormData);
  assert.equal(
    (await getGenerationSession('course-generation:key')).status,
    'completed',
  );
  assert(calls.at(-1)!.path.includes('course-generation%3Akey'));
  const mapped = courseBasicToLearningCourse({
    id: C,
    title: 'Course',
    creatorId: L,
    learningObjectives: ['Goal'],
    modules: [
      { id: M, rank: 'a', title: 'Second' },
      { id: L, rank: 'Z', title: 'First' },
    ],
  });
  assert.equal(mapped.blocks[0].title, 'First');
  assert.equal(mapped.creator_id, L);
  assert.deepEqual(mapped.learningObjectives, ['Goal']);
  assert.equal(
    lessonBasicToLearningLesson({
      id: L,
      estimatedTimeMinutes: 15,
      learningObjectives: ['Goal'],
    }).duration,
    '15 мин.',
  );
  assert(calls.every((c) => !c.path.startsWith('/agent/')));
});

void test('parallel numeric UI reorder requests are serialized and persist the intended rank order', async () => {
  let ids = ['a', 'b', 'c'];
  setResponder((path, method, body) => {
    if (method === 'GET')
      return {
        id: C,
        modules: ids.map((id, i) => ({
          id,
          rank: String.fromCharCode(65 + i),
        })),
      };
    if (method === 'PATCH' && path.endsWith('/move')) {
      const id = path.split('/')[2];
      ids = ids.filter((value) => value !== id);
      const index = body.position?.beforeId
        ? ids.indexOf(body.position?.beforeId)
        : ids.length;
      ids.splice(index, 0, id);
      return { id, title: id, rank: String.fromCharCode(65 + index) };
    }
    throw new Error(`Unexpected ${method} ${path}`);
  });
  await Promise.all(
    ['c', 'a', 'b'].map((id, i) => updateModule(C, id, { order: i + 1 })),
  );
  assert.deepEqual(ids, ['c', 'a', 'b']);
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 3);
});

void test('theory sessions use the progress router and PATCH; generation keys retain their prefix', async () => {
  setResponder(() => ({ id: L }));
  await createSession(L);
  await updateSession(L, {
    completed_at: '2026-11-16T00:00:00Z',
    active_time_seconds: 30,
    max_scroll_depth_percent: 90,
  });
  assert.equal(calls[0].path, `/progress/theory-sessions/${L}`);
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(
    extractTaskId({ content: 'task_id=module-generation:1234-abcd' }),
    'module-generation:1234-abcd',
  );
});

void test('a failed move does not block later requests in the course queue', async () => {
  let moves = 0;
  setResponder((path, method) => {
    if (method === 'GET')
      return {
        modules: [
          { id: M, rank: 'A' },
          { id: L, rank: 'B' },
        ],
      };
    moves += 1;
    if (moves === 1) throw new Error('Simulated conflict');
    return { id: L, title: 'Saved', rank: 'B' };
  });
  const result = await Promise.allSettled([
    updateModule(C, M, { order: 2 }),
    updateModule(C, L, { order: 1 }),
  ]);
  assert.equal(result[0].status, 'rejected');
  assert.equal(result[1].status, 'fulfilled');
  assert.equal(moves, 2);
});
