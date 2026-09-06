import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function isolated() {
  const root = mkdtempSync(join(tmpdir(), 'wiki-setup-'));
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/setup.mjs'), readFileSync('scripts/setup.mjs'));
  writeFileSync(join(root, '.env.example'), readFileSync('.env.example'));
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [join(root, 'scripts/setup.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  return { root, run, read: () => readFileSync(join(root, '.env'), 'utf8') };
}
test('setup generates distinct admin and MCP credentials without logging them', () => {
  const f = isolated();
  try {
    const log = f.run(); const env = f.read();
    const admin = /^ADMIN_PASSWORD=(.+)$/m.exec(env)![1];
    const mcp = /^MCP_TOKEN=(.+)$/m.exec(env)![1];
    assert.ok(admin.length >= 32); assert.ok(mcp.length >= 32);
    assert.notEqual(admin, mcp); assert.ok(!log.includes(admin)); assert.ok(!log.includes(mcp));
    f.run(); assert.equal(f.read(), env);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('setup upgrade preserves credentials and intentionally blank keys, and is idempotent', () => {
  const f = isolated();
  try {
    const original = 'ADMIN_PASSWORD=existing-admin-value\nMCP_READ_TOKEN=\nexport MCP_ALLOW_ADMIN_PASSWORD=false\n';
    writeFileSync(join(f.root, '.env'), original);
    f.run(); assert.equal(f.read(), original);
    const log = f.run('--upgrade'); const upgraded = f.read();
    assert.ok(upgraded.startsWith(original)); assert.ok(/^MCP_TOKEN=.{32,}$/m.test(upgraded));
    assert.equal((upgraded.match(/MCP_READ_TOKEN=/g) || []).length, 1);
    assert.equal((upgraded.match(/MCP_ALLOW_ADMIN_PASSWORD=/g) || []).length, 1);
    assert.ok(!log.includes('existing-admin-value'));
    f.run('--upgrade'); assert.equal(f.read(), upgraded);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
