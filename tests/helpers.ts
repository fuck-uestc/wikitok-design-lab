import { mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/src/app.js';
import { loadConfig } from '../backend/src/config.js';

export const password = 'Test-only-passphrase-2026!';
export const record = (title: string, extra: Record<string, unknown> = {}) => ({ title, content: `## ${title}\n\n这是一条在隔离测试数据库中创建的校园资料。`, ...extra });
export async function fixture(t: TestContext, overrides: NodeJS.ProcessEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-wiki-test-'));
  const env = { NODE_ENV: 'test', MCP_ALLOW_ADMIN_PASSWORD: 'true', SITE_NAME: '测试校园 Wiki', PUBLIC_SITE_URL: 'http://localhost:5173', PUBLIC_API_BASE_URL: '/api', DATABASE_PATH: join(directory, 'wiki.sqlite'), UPLOAD_DIR: join(directory, 'uploads'), BACKUP_DIR: join(directory, 'backups'), ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: password, COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax', CORS_ORIGINS: 'http://localhost:5173', TRUST_PROXY: '0', MAX_UPLOAD_MB: '1', ...overrides };
  const config = loadConfig(env);
  const application = createApp(config);
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    application.close();
    const target = resolve(directory);
    assert.equal(dirname(target).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.ok(basename(target).startsWith('campus-wiki-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  function client() {
    let cookie = '';
    let csrfToken = '';
    return {
      async request(path: string, options: { method?: string; body?: unknown; expected?: number; csrf?: boolean; headers?: Record<string, string> } = {}) {
        const headers: Record<string, string> = { ...(cookie ? { cookie } : {}), ...(csrfToken && options.csrf !== false ? { 'x-csrf-token': csrfToken } : {}), ...options.headers };
        let body: BodyInit | undefined;
        if (options.body instanceof FormData) body = options.body;
        else if (options.body !== undefined) { body = JSON.stringify(options.body); headers['content-type'] = 'application/json'; }
        const response = await fetch(base + path, { method: options.method || 'GET', headers, body });
        const text = await response.text();
        let data: any;
        try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
        assert.equal(response.status, options.expected ?? 200, `${options.method || 'GET'} ${path}: ${text.slice(0, 1500)}`);
        const setCookie = response.headers.getSetCookie()[0];
        if (setCookie) cookie = setCookie.split(';')[0];
        if (data?.csrfToken) csrfToken = data.csrfToken;
        return { data, response, text };
      }
    };
  }
  const admin = client();
  await admin.request('/api/admin/login', { method: 'POST', body: { username: 'admin', password } });
  return { ...application, directory, env, config, base, admin, publicClient: client(), client };
}
export function filesBody(files: { name: string; content: string | Uint8Array; type?: string }[], fields: Record<string, string> = {}) {
  const body = new FormData();
  for (const file of files) body.append('files', new Blob([file.content as BlobPart], { type: file.type || 'application/octet-stream' }), file.name);
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return body;
}
export const jsonImport = (records: unknown, fields: Record<string, string> = {}) => filesBody([{ name: 'artifacts.json', content: JSON.stringify(records), type: 'application/json' }], fields);
