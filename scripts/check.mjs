import { spawnSync } from 'node:child_process';
const results = [];
for (const script of ['typecheck', 'test', 'build']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], { stdio: 'inherit', env: process.env });
  results.push({ check: script, status: result.status === 0 ? 'PASS' : 'FAIL' });
}
console.table(results);
process.exitCode = results.every(result => result.status === 'PASS') ? 0 : 1;
