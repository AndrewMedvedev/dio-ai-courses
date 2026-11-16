import { build } from 'esbuild';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'course-state-tests-'));
const outputs = [join(directory, 'state.cjs'), join(directory, 'dnd.cjs')];
try {
  await build({
    entryPoints: { state: 'src/app/state-persistence.test.tsx', dnd: 'src/pages/dnd-course/model/draft.test.ts' },
    outdir: directory, outExtension: { '.js': '.cjs' },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ DEV: false }), 'import.meta.glob': 'undefined', 'process.env.NODE_ENV': '"test"' },
    loader: { '.svg': 'text' }, logLevel: 'warning',
  });
  // React scheduler оставляет MessagePort в имитации браузера после завершения тестов.
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', '--test-timeout=30000', ...outputs], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await Promise.all(outputs.map((file) => rm(file, { force: true })));
  await rmdir(directory);
}
