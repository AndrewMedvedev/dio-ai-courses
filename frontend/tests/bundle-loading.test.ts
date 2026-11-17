import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

interface Chunk {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
  isDynamicEntry?: boolean;
}

// Run after `npm run build`: verify the emitted graph, not source import syntax.
const manifest = JSON.parse(
  readFileSync('dist/.vite/manifest.json', 'utf8'),
) as Record<string, Chunk>;

function initialChunks(key: string, result = new Set<string>()): Set<string> {
  if (result.has(key)) return result;
  result.add(key);
  for (const dependency of manifest[key].imports || []) {
    initialChunks(dependency, result);
  }
  return result;
}

void test('initial JavaScript stays within 250 KiB gzip and excludes page editors and Mermaid', () => {
  const initial = initialChunks('index.html');
  const files = new Set([...initial].map((key) => manifest[key].file));
  const bytes = [...files].reduce(
    (total, file) => total + gzipSync(readFileSync(`dist/${file}`)).length,
    0,
  );
  assert.ok(
    bytes < 250 * 1024,
    `Initial JavaScript grew to ${bytes} gzip bytes`,
  );
  assert.ok(
    [...initial].every((key) => !key.includes('mermaid')),
    'Mermaid must wait for a diagram instead of loading on every page',
  );
  for (const page of [
    'dnd-course',
    'course-edit',
    'lesson-edit',
    'course-view',
    'creator',
  ]) {
    const key = `src/pages/${page}/index.ts`;
    assert.equal(manifest[key].isDynamicEntry, true, page);
    assert.equal(initial.has(key), false, page);
    assert.ok(manifest['index.html'].dynamicImports?.includes(key), page);
  }
  assert.ok(
    Object.entries(manifest).some(
      ([key, chunk]) =>
        key.includes('mermaid.core') &&
        chunk.isDynamicEntry &&
        !initial.has(key),
    ),
  );
});
