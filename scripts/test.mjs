import { spawnSync } from 'node:child_process';
import { rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../.test-build/', import.meta.url);
function run(args) {
  const child = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (child.error) throw child.error;
  return child.status ?? 1;
}
try {
  process.exitCode = run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json']);
  if (!process.exitCode) {
    const tests = readdirSync(new URL('tests/', output)).filter(name => name.endsWith('.test.js')).map(name => `.test-build/tests/${name}`);
    process.exitCode = run(['--test', ...tests]);
  }
} finally { rmSync(output, { recursive: true, force: true }); }
