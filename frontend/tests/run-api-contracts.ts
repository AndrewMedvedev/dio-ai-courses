import { buildSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const outfile = join(tmpdir(), 'dio-new-api-contracts.cjs');
buildSync({
  entryPoints: ['tests/new-api-contracts.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  define: { 'import.meta.env': '{}' },
  alias: {
    '@/shared/api': './tests/fixtures/api.ts',
    '@/shared/ui/mermaid-diagram': './tests/fixtures/mermaid.ts',
    '@': './src',
  },
});
process.exitCode =
  spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' })
    .status ?? 1;
