import {
  createSession,
  updateSession,
} from '../src/entities/progress/api/theory-session-api';
import { extractTaskId } from '../src/entities/agent-chat/lib/agent-chat-utils';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calls, setResponder } from './fixtures/api';
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
