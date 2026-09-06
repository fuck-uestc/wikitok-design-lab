import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { artifactSchema } from '../shared/schema.js';
import { fixture, filesBody, password, record } from './helpers.js';

test('bootstraps an empty migrated database and exposes only public configuration', async t => {
  const f = await fixture(t, { SITE_NAME: '校园 <script>test</script>', PUBLIC_API_BASE_URL: 'https://api.example.edu/api' });
  assert.equal((await f.publicClient.request('/api/health')).data.status, 'ok');
  const config = await f.publicClient.request('/api/config');
  assert.equal(config.data.apiBaseUrl, 'https://api.example.edu/api');
  assert.ok(!config.text.includes(password));
  assert.ok(!config.text.includes('databasePath'));
  const runtime = await f.publicClient.request('/runtime-config.js');
  assert.ok(runtime.text.includes('\\u003cscript>'));
  assert.ok(!runtime.text.includes(password));
  assert.match(runtime.response.headers.get('cache-control')!, /no-store/);
  assert.equal((await f.publicClient.request('/api/artifacts')).data.total, 0);
  assert.equal((await f.admin.request('/api/admin/stats')).data.published, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM schema_migrations').get()!.n, 2);
  const readOnly = new DatabaseSync(f.config.databasePath, { readOnly: true });
  assert.equal(readOnly.prepare('SELECT COUNT(*) n FROM admins').get()!.n, 1);
  readOnly.close();
});

test('requires login, CSRF and allowed origins for admin changes; cookies are HttpOnly', async t => {
  const f = await fixture(t);
  await f.publicClient.request('/api/admin/artifacts', { expected: 401 });
  await f.publicClient.request('/api/admin/artifacts', { method: 'POST', body: record('非法写入'), expected: 401 });
  await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('缺少 CSRF'), csrf: false, expected: 403 });
  await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('错误 CSRF'), headers: { 'x-csrf-token': 'x'.repeat(43) }, expected: 403 });
  await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('不可信来源'), headers: { origin: 'https://evil.example' }, expected: 403 });
  const login = await f.client().request('/api/admin/login', { method: 'POST', body: { username: 'admin', password } });
  const cookie = login.response.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Path=\/api/);
  await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('合法来源'), headers: { origin: 'http://localhost:5173' }, expected: 201 });
  assert.equal(f.store.stats().draft, 1);
});

test('draft, publish, search aliases, archive and restore form a persistent revisioned lifecycle', async t => {
  const f = await fixture(t);
  const draft = (await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('校园人物记录', { aliases: ['曾用名125'], author: '原帖作者', tags: ['人物'], category: '社区历史', sourceThreadId: '2234791' }), expected: 201 })).data;
  assert.equal(draft.version, 1); assert.equal(draft.status, 'draft'); assert.ok(draft.summary.length > 0);
  await f.publicClient.request(`/api/artifacts/${draft.id}`, { expected: 404 });
  assert.equal((await f.publicClient.request('/api/artifacts')).data.total, 0);
  const { id, version, createdAt, updatedAt, publishedAt, attachments, ...input } = draft;
  const published = (await f.admin.request(`/api/admin/artifacts/${id}`, { method: 'PUT', body: { ...input, status: 'published', version } })).data;
  assert.equal(published.version, 2); assert.ok(published.publishedAt);
  const search = await f.publicClient.request('/api/artifacts?q=' + encodeURIComponent('曾用名125'));
  assert.equal(search.data.items[0].id, id);
  assert.equal((await f.publicClient.request('/api/artifacts?q=2234791')).data.total, 1);
  const taxonomy = (await f.publicClient.request('/api/taxonomy')).data;
  assert.deepEqual(taxonomy.categories, [{ name: '社区历史', count: 1 }]);
  await f.admin.request(`/api/admin/artifacts/${id}`, { method: 'PUT', body: { ...input, version: 1 }, expected: 409 });
  const archived = (await f.admin.request(`/api/admin/artifacts/${id}`, { method: 'DELETE', body: { version: 2 } })).data;
  assert.equal(archived.status, 'archived');
  await f.publicClient.request(`/api/artifacts/${id}`, { expected: 404 });
  const restored = (await f.admin.request(`/api/admin/artifacts/${id}/restore`, { method: 'POST', body: { version: 3, revision: 2 } })).data;
  assert.equal(restored.version, 4); assert.equal(restored.status, 'published');
  assert.equal((await f.admin.request(`/api/admin/artifacts/${id}/revisions`)).data.length, 4);
  assert.equal((await f.publicClient.request(`/api/artifacts/${encodeURIComponent(restored.slug)}`)).data.title, '校园人物记录');
  assert.equal((await f.admin.request('/api/admin/export')).data.artifacts[0].title, '校园人物记录');
});

test('validates unique identities, unsafe URLs, malformed dates and unknown fields', async t => {
  const f = await fixture(t);
  const original = (await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('相同标题', { externalId: 'bbs:123' }), expected: 201 })).data;
  await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('相同标题'), expected: 409 });
  await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('不同标题', { externalId: 'bbs:123' }), expected: 409 });
  for (const extra of [{ sourceUrl: 'javascript:alert(1)' }, { coverUrl: 'data:image/svg+xml,evil' }, { sourceUrl: 'https://admin:password@example.edu' }, { eventDate: '2026-02-30' }, { irrelevant: true }, { coverMediaId: 'missing' }, { attachmentIds: ['missing'] }]) {
    await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('无效记录', extra), expected: 400 });
  }
  assert.equal(f.store.stats().draft, 1); assert.equal(f.store.get(original.id)!.version, 1);
});

test('uses real pagination without duplicates, escapes LIKE patterns and excludes unpublished data', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 31; i++) f.store.save(artifactSchema.parse(record(`校园资料 ${i}`, { status: 'published', category: i % 2 ? '生活' : '学习' })), 'test');
  f.store.save(artifactSchema.parse(record('未公开资料')), 'test');
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const result: any = (await f.publicClient.request(`/api/artifacts?limit=7${cursor ? `&cursor=${cursor}` : ''}`)).data;
    assert.equal(result.total, 31); assert.ok(result.items.length <= 7);
    ids.push(...result.items.map((item: { id: string }) => item.id)); cursor = result.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 31); assert.equal(new Set(ids).size, 31);
  assert.equal((await f.publicClient.request('/api/artifacts?q=%25')).data.total, 0);
  assert.equal((await f.publicClient.request('/api/artifacts?q=' + encodeURIComponent("' OR 1=1 --"))).data.total, 0);
  assert.equal((await f.publicClient.request('/api/artifacts?category=' + encodeURIComponent('生活'))).data.total, 15);
  assert.equal((await f.publicClient.request(`/api/artifacts?ids=${ids.slice(0, 2).join(',')}`)).data.total, 2);
  await f.publicClient.request('/api/artifacts?cursor=not-json', { expected: 400 });
  await f.publicClient.request('/api/artifacts?limit=100000', { expected: 400 });
  assert.equal((await f.publicClient.request('/api/artifacts/random')).data.status, 'published');
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zgAAAABJRU5ErkJggg==', 'base64');
test('validates file signatures, deduplicates media, and only exposes published references', async t => {
  const f = await fixture(t);
  const upload = (await f.admin.request('/api/admin/media', { method: 'POST', body: filesBody([{ name: '封面.png', content: png, type: 'image/png' }]), expected: 201 })).data.items[0];
  assert.equal(upload.originalName, '封面.png'); assert.equal(upload.mimeType, 'image/png');
  await f.publicClient.request(upload.url, { expected: 404 });
  await f.admin.request(upload.url);
  const duplicate = (await f.admin.request('/api/admin/media', { method: 'POST', body: filesBody([{ name: 'same.png', content: png }]), expected: 201 })).data.items[0];
  assert.equal(upload.id, duplicate.id);
  await f.admin.request('/api/admin/media', { method: 'POST', body: filesBody([{ name: 'evil.svg', content: '<svg onload="alert(1)"></svg>', type: 'image/png' }]), expected: 400 });
  await f.admin.request('/api/admin/media', { method: 'POST', body: filesBody([{ name: 'ok.txt', content: '合法文本' }, { name: 'bad.html', content: '<script>alert(1)</script>' }]), expected: 400 });
  assert.equal(f.store.stats().media, 1);
  const a = (await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('带图片的公开条目', { coverMediaId: upload.id, status: 'published', attachmentIds: [upload.id] }), expected: 201 })).data;
  const response = await f.publicClient.request(upload.url);
  assert.match(response.response.headers.get('content-type')!, /image\/png/);
  assert.equal(response.response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.response.headers.get('cache-control')!, /no-store/);
  assert.equal((await f.publicClient.request(`/api/artifacts/${a.id}`)).data.attachments[0].id, upload.id);
  await f.admin.request(`/api/admin/artifacts/${a.id}`, { method: 'DELETE', body: { version: a.version } });
  await f.publicClient.request(upload.url, { expected: 404 });
  await f.admin.request(upload.url);
  await f.admin.request('/api/admin/media', { method: 'POST', body: filesBody([{ name: 'large.png', content: Buffer.concat([png, Buffer.alloc(1024 * 1024)]) }]), expected: 413 });
});

test('serves text attachments as downloads, never executable HTML', async t => {
  const f = await fixture(t);
  const file = (await f.admin.request('/api/admin/media', { method: 'POST', body: filesBody([{ name: 'notes.txt', content: '<script>alert(1)</script>\n课堂笔记' }]), expected: 201 })).data.items[0];
  f.store.save(artifactSchema.parse(record('附件测试', { status: 'published', attachmentIds: [file.id] })), 'test');
  const result = await f.publicClient.request(file.url);
  assert.match(result.response.headers.get('content-disposition')!, /^attachment/);
  assert.match(result.response.headers.get('content-type')!, /^text\/plain/);
});

test('password rotation and logout revoke opaque server-side sessions', async t => {
  const f = await fixture(t);
  const second = f.client();
  await second.request('/api/admin/login', { method: 'POST', body: { username: 'admin', password } });
  await f.admin.request('/api/admin/password', { method: 'POST', body: { currentPassword: 'wrong', newPassword: 'new-test-passphrase-2026' }, expected: 400 });
  await f.admin.request('/api/admin/password', { method: 'POST', body: { currentPassword: password, newPassword: 'new-test-passphrase-2026' }, expected: 204 });
  await second.request('/api/admin/session', { expected: 401 });
  await f.admin.request('/api/admin/session', { expected: 401 });
  await f.admin.request('/api/admin/login', { method: 'POST', body: { username: 'admin', password }, expected: 401 });
  await f.admin.request('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'new-test-passphrase-2026' } });
  assert.match(String(f.store.db.prepare('SELECT password_hash FROM admins').get()!.password_hash), /^scrypt:/);
  await f.admin.request('/api/admin/logout', { method: 'POST', expected: 204 });
  await f.admin.request('/api/admin/session', { expected: 401 });
});

test('rate limits repeated failed logins', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) await f.publicClient.request('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'incorrect' }, expected: 401 });
  const blocked = await f.publicClient.request('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'incorrect' }, expected: 429 });
  assert.equal(blocked.data.error.code, 'LOGIN_LIMITED');
});

test('backup CLI copies a consistent SQLite snapshot and media with integrity manifest', async t => {
  const f = await fixture(t);
  f.store.save(artifactSchema.parse(record('备份验证', { status: 'published' })), 'test');
  await f.admin.request('/api/admin/media', { method: 'POST', body: filesBody([{ name: '备份.txt', content: '备份文件内容' }]), expected: 201 });
  execFileSync(process.execPath, [fileURLToPath(new URL('../backend/src/cli.js', import.meta.url)), 'backup'], { cwd: process.cwd(), env: { ...process.env, ...f.env }, encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
  const backupDir = join(f.config.backupDir, readdirSync(f.config.backupDir)[0]);
  const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.integrity, 'ok'); assert.equal(manifest.artifacts, 1); assert.equal(manifest.media, 1);
  assert.equal(readdirSync(join(backupDir, 'uploads')).length, 1);
  const db = new DatabaseSync(join(backupDir, 'wiki.sqlite'), { readOnly: true });
  assert.equal(db.prepare('SELECT title FROM artifacts').get()!.title, '备份验证');
  db.close();
});
