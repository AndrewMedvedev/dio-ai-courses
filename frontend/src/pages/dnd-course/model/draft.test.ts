/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import { getPersistenceScope, useSessionStore } from '@/entities/session';
import { writeStoredFiles } from '@/shared/lib/storage';
import { loadDraft, saveDraft, clearDraft, EMPTY_DRAFT } from './draft';
import { useDndCourseStore, hasFile } from './store';
import { DRAFT_KEY } from '../config/constants';

const values = new Map<string, string>();
Object.assign(globalThis, {
  indexedDB,
  window: Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    setTimeout,
    clearTimeout,
    location: new URL('http://localhost/'),
  }),
});
globalThis.fetch = () =>
  Promise.reject(new Error('Real network is blocked in state tests'));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

void test('D&D draft keeps forms and viewport, and does not cross account boundaries', () => {
  const draft = {
    ...EMPTY_DRAFT,
    courseForm: { ...EMPTY_DRAFT.courseForm, title: 'Local course' },
    viewport: { x: 10, y: 20, zoom: 1.5 },
  };
  assert.equal(saveDraft(draft, 'owner-a'), true);
  assert.equal(loadDraft('owner-a').draft.courseForm.title, 'Local course');
  assert.deepEqual(loadDraft('owner-a').draft.viewport, draft.viewport);
  assert.equal(loadDraft('owner-b').draft.courseForm.title, '');
  clearDraft({ scope: 'owner-b' });
  assert.equal(loadDraft('owner-a').draft.courseForm.title, 'Local course');
});

void test('D&D recovers an interrupted upload as an explicit error, retaining its content', () => {
  values.set(
    `${DRAFT_KEY}:interrupted`,
    JSON.stringify({
      ...EMPTY_DRAFT,
      materials: [
        {
          id: 'upload-1',
          fileName: 'notes.txt',
          status: 'uploading',
          markdown: '',
        },
        {
          id: 'upload-2',
          fileName: 'ready.txt',
          status: 'uploading',
          markdown: 'Saved text',
        },
      ],
    }),
  );
  const { materials } = loadDraft('interrupted').draft;
  assert.equal(materials[0].status, 'error');
  assert.equal(materials[0].interrupted, true);
  assert.equal(materials[1].status, 'ready');
  assert.equal(materials[1].markdown, 'Saved text');
});

void test('D&D ignores malformed JSON without clearing another draft', () => {
  values.set(`${DRAFT_KEY}:broken`, '{');
  assert.equal(loadDraft('broken').draft.materials.length, 0);
  assert.equal(loadDraft('owner-a').draft.courseForm.title, 'Local course');
});

void test('D&D file registry restores from IndexedDB when switching back to an account', async () => {
  useSessionStore.setState({ user: { id: 'dnd-a' }, organizationId: 'org' });
  const scope = getPersistenceScope();
  values.set(
    `${DRAFT_KEY}:${scope}`,
    JSON.stringify({
      ...EMPTY_DRAFT,
      materials: [
        {
          id: 'material-a',
          fileName: 'saved.txt',
          status: 'error',
          markdown: '',
        },
      ],
    }),
  );
  await writeStoredFiles(`dnd-files:${scope}`, [
    {
      id: 'material-a',
      data: new Blob(['saved content']),
      name: 'saved.txt',
      lastModified: 1,
    },
  ]);
  useDndCourseStore.getState().hydrate();
  await tick();
  assert.equal(useDndCourseStore.getState().hydrated, true);
  assert.equal(hasFile('material-a'), true);
  useSessionStore.setState({ user: { id: 'dnd-b' } });
  useDndCourseStore.getState().hydrate();
  await tick();
  assert.equal(useDndCourseStore.getState().materials.length, 0);
  assert.equal(hasFile('material-a'), false);
  useSessionStore.setState({ user: { id: 'dnd-a' } });
  useDndCourseStore.getState().hydrate();
  await tick();
  assert.equal(hasFile('material-a'), true);
});
