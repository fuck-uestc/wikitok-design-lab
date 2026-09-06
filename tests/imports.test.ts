import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, filesBody, jsonImport, record } from './helpers.js';

test('JSON import previews without writing, commits once, and skips duplicate identities', async t => {
  const f = await fixture(t);
  const records = [record('导入一', { externalId: 'bbs:1' }), record('导入二', { externalId: 'bbs:2' })];
  const preview = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport({ artifacts: records }) })).data;
  assert.deepEqual(preview.counts, { create: 2, update: 0, skip: 0, error: 0 });
  assert.equal(f.store.stats().draft, 0);
  await f.admin.request(`/api/admin/imports/${preview.id}/commit`, { method: 'POST' });
  assert.equal(f.store.stats().draft, 2);
  await f.admin.request(`/api/admin/imports/${preview.id}/commit`, { method: 'POST', expected: 409 });
  const duplicate = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport(records) })).data;
  assert.equal(duplicate.counts.skip, 2); assert.equal(duplicate.canCommit, false);
  assert.equal((await f.publicClient.request('/api/artifacts')).data.total, 0);
});

test('update imports retain IDs, create revisions, and honor explicit status', async t => {
  const f = await fixture(t);
  const original = (await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('旧标题', { externalId: 'bbs:42', status: 'published' }), expected: 201 })).data;
  const preview = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport([record('新标题', { externalId: 'bbs:42', status: 'published', tags: ['新标签'] })], { policy: 'update' }) })).data;
  assert.equal(preview.counts.update, 1);
  await f.admin.request(`/api/admin/imports/${preview.id}/commit`, { method: 'POST' });
  const updated = f.store.get(original.id)!;
  assert.equal(updated.title, '新标题'); assert.equal(updated.version, 2); assert.equal(updated.status, 'published'); assert.deepEqual(updated.tags, ['新标签']);
  const errors = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport([record('新标题', { externalId: 'bbs:42' })], { policy: 'error' }) })).data;
  assert.equal(errors.counts.error, 1); assert.equal(errors.canCommit, false);
});

test('invalid records and duplicates prevent any batch write and include row errors', async t => {
  const f = await fixture(t);
  const invalid = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport([record('有效记录'), { title: '缺少正文' }]) })).data;
  assert.equal(invalid.counts.error, 1); assert.equal(invalid.canCommit, false);
  assert.equal(invalid.rows[1].row, 2); assert.ok(invalid.rows[1].errors[0].includes('content'));
  await f.admin.request(`/api/admin/imports/${invalid.id}/commit`, { method: 'POST', expected: 410 });
  assert.equal(f.store.stats().draft, 0);
  const duplicate = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport([record('批内重复'), record('批内重复')]) })).data;
  assert.equal(duplicate.counts.error, 1); assert.equal(duplicate.canCommit, false);
});

test('stale and expired previews cannot overwrite newer edits or partially import', async t => {
  const f = await fixture(t);
  const original = (await f.admin.request('/api/admin/artifacts', { method: 'POST', body: record('已有条目', { externalId: 'bbs:old' }), expected: 201 })).data;
  const preview = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport([record('应该原子回滚'), record('已有条目', { externalId: 'bbs:old' })], { policy: 'update' }) })).data;
  await f.admin.request(`/api/admin/artifacts/${original.id}`, { method: 'DELETE', body: { version: 1 } });
  const stale = await f.admin.request(`/api/admin/imports/${preview.id}/commit`, { method: 'POST', expected: 409 });
  assert.equal(stale.data.error.code, 'IMPORT_STALE'); assert.equal(f.store.get('应该原子回滚'), null);
  f.store.db.prepare('UPDATE import_batches SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', preview.id);
  await f.admin.request(`/api/admin/imports/${preview.id}/commit`, { method: 'POST', expected: 410 });
});

test('CSV BOM/multiline, YAML Markdown and BBS field aliases preserve Chinese metadata', async t => {
  const f = await fixture(t, { BBS_THREAD_URL_TEMPLATE: 'https://bbs.example.edu/forum.php?mod=viewthread&tid={id}' });
  const csv = '\uFEFFtitle,content,tags,status\n"CSV 中文","第一段\n第二段","校园|生活",published\n';
  const markdown = '---\ntitle: Markdown 校园条目\nslug: md-campus\ntags: [校园, 历史]\neventDate: 2026-09-01\nstatus: draft\n---\n\n## 正文\n\n可核对的资料。';
  const json = JSON.stringify({ data: { rows: [{ title: 'BBS 转换记录', body: ['第一段', '第二段'], thread_id: 12345, author_name: '真实字段作者', external_id: 'bbs:12345', forum_name: '校园专区', aliases: '旧昵称,曾用名' }] } });
  const preview = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: filesBody([{ name: '中文表格.csv', content: csv }, { name: '记忆.md', content: markdown }, { name: 'bbs.json', content: json }]) })).data;
  assert.equal(preview.counts.error, 0, JSON.stringify(preview.rows)); assert.equal(preview.counts.create, 3);
  assert.equal(preview.rows[0].file, '中文表格.csv');
  await f.admin.request(`/api/admin/imports/${preview.id}/commit`, { method: 'POST' });
  assert.equal(f.store.stats().published, 1); assert.equal(f.store.stats().draft, 2);
  const item = f.store.get('bbs-转换记录')!;
  assert.equal(item.sourceUrl, 'https://bbs.example.edu/forum.php?mod=viewthread&tid=12345');
  assert.deepEqual(item.aliases, ['旧昵称', '曾用名']); assert.equal(item.content, '第一段\n\n第二段');
  assert.equal(f.store.get('md-campus')!.eventDate, '2026-09-01');
});

test('rejects executable Markdown front matter, invalid encoding and batch limits', async t => {
  const f = await fixture(t, { IMPORT_MAX_RECORDS: '2' });
  const payload = '---js\n{ title: (globalThis.__unsafeWikiImport = true, "executed") }\n---\nbody';
  const preview = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: filesBody([{ name: 'attack.md', content: payload }]) })).data;
  assert.equal(preview.counts.error, 1); assert.equal((globalThis as any).__unsafeWikiImport, undefined);
  const encoding = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: filesBody([{ name: 'gbk.csv', content: Buffer.from([0xff, 0xfe, 0xfa]) }]) })).data;
  assert.equal(encoding.counts.error, 1); assert.match(encoding.rows[0].errors[0], /UTF-8/);
  await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: jsonImport([record('1'), record('2'), record('3')]), expected: 413 });
  assert.equal(f.store.stats().draft, 0);
});

test('every bundled import template is accepted by the production import parser', async t => {
  const f = await fixture(t);
  const files = ['artifacts.json', 'artifacts.csv', 'artifact.md'].map(name => ({ name, content: readFileSync(`frontend/public/templates/${name}`, 'utf8') }));
  const preview = (await f.admin.request('/api/admin/imports/preview', { method: 'POST', body: filesBody(files) })).data;
  assert.equal(preview.counts.error, 0, JSON.stringify(preview.rows)); assert.equal(preview.counts.create, 7);
});
