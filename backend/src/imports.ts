import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import matter from 'gray-matter';
import { artifactSchema, slugify } from '../../shared/schema.js';
import type { ArtifactInput, ImportPolicy, ImportPreview, ImportRow } from '../../shared/types.js';
import { ApiError } from './errors.js';
import type { Store } from './store.js';

interface PlanItem { input: ArtifactInput; action: ImportRow['action']; existingId?: string; version?: number }
interface Plan { preview: ImportPreview; items: PlanItem[] }
export interface ImportFile { originalname: string; buffer: Buffer }
const splitTerms = (value: unknown) => typeof value === 'string' ? value.split(/[|,，]/).map(v => v.trim()).filter(Boolean) : value;

function normalize(raw: unknown, defaultStatus: 'draft' | 'published', store: Store): ArtifactInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('每条记录必须是 JSON 对象');
  const record = { ...raw } as Record<string, unknown>;
  const aliases: Record<string, string[]> = {
    content: ['contentMarkdown', 'content_markdown', 'body'], summary: ['excerpt', 'extract'],
    author: ['author_name', 'username'], category: ['board', 'forum_name'],
    sourceUrl: ['source_url', 'url'], sourceTitle: ['source_title'], sourceThreadId: ['source_thread_id', 'thread_id', 'tid'], externalId: ['external_id'],
    coverUrl: ['cover_url'], coverMediaId: ['cover_media_id'], coverAlt: ['cover_alt'], coverCredit: ['cover_credit'], eventDate: ['event_date'], attachmentIds: ['attachment_ids'], feedIds: ['feed_ids'], short: ['shortContent', 'short_content']
  };
  for (const [canonical, names] of Object.entries(aliases)) {
    for (const name of names) { if (record[canonical] === undefined && record[name] !== undefined) record[canonical] = record[name]; delete record[name]; }
  }
  if (Array.isArray(record.content)) record.content = record.content.join('\n\n');
  if (record.sourceThreadId !== undefined) record.sourceThreadId = String(record.sourceThreadId);
  if (record.externalId !== undefined) record.externalId = String(record.externalId);
  if (record.eventDate instanceof Date) record.eventDate = record.eventDate.toISOString().slice(0, 10);
  for (const key of ['tags', 'aliases', 'attachmentIds', 'feedIds']) if (record[key] !== undefined) record[key] = splitTerms(record[key]);
  if (typeof record.short === 'string' && record.short.trim()) record.short = JSON.parse(record.short);
  if (record.short === '') delete record.short;
  if (record.format === '') delete record.format;
  if (!record.sourceUrl && record.sourceThreadId && store.config.threadUrlTemplate) record.sourceUrl = store.config.threadUrlTemplate.replaceAll('{id}', encodeURIComponent(String(record.sourceThreadId)));
  if (!record.status) record.status = defaultStatus;
  const parsed = artifactSchema.safeParse(record);
  if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join('.') || 'record'}: ${issue.message}`).join('；'));
  return { ...parsed.data, slug: parsed.data.slug || slugify(parsed.data.title) };
}

function decode(buffer: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); }
  catch { throw new Error('文件必须使用 UTF-8 编码；Excel 请另存为 CSV UTF-8'); }
}
export function createPreview(store: Store, files: ImportFile[], adminId: string, policy: ImportPolicy, defaultStatus: 'draft' | 'published'): ImportPreview {
  const rows: ImportRow[] = [];
  const items: PlanItem[] = [];
  const seenSlugs = new Set<string>();
  const seenExternal = new Set<string>();
  const seenIds = new Set<string>();
  let count = 0;
  for (const file of files) {
    let records: unknown[];
    try {
      const text = decode(file.buffer);
      const name = file.originalname.toLowerCase();
      if (name.endsWith('.json')) {
        const json: unknown = JSON.parse(text);
        if (Array.isArray(json)) records = json;
        else if (json && typeof json === 'object' && 'artifacts' in json && Array.isArray(json.artifacts)) records = json.artifacts;
        else if (json && typeof json === 'object' && 'data' in json && json.data && typeof json.data === 'object' && 'rows' in json.data && Array.isArray(json.data.rows)) records = json.data.rows;
        else records = [json];
      } else if (name.endsWith('.csv')) {
        records = parse(text, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 300000 });
      } else if (/\.md(?:own)?$|\.markdown$/.test(name)) {
        // Only YAML front matter is accepted. gray-matter's JS engine must never execute uploaded input.
        if (text.startsWith('---') && !/^---[ \t]*(?:\r?\n|$)/.test(text)) throw new Error('Markdown front matter 只支持 --- 包围的 YAML，不接受其他引擎');
        const parsed = matter(text, { language: 'yaml', engines: { javascript: () => { throw new Error('不允许可执行 front matter'); }, js: () => { throw new Error('不允许可执行 front matter'); } } });
        const heading = parsed.content.match(/^#\s+(.+)$/m)?.[1];
        records = [{ title: parsed.data.title || heading || file.originalname.replace(/\.[^.]+$/, ''), ...parsed.data, content: parsed.content.trim() }];
      } else throw new Error('只支持 .json、.csv、.md、.markdown 文件');
      if (!records.length) throw new Error('文件中没有记录');
    } catch (error) {
      rows.push({ row: 0, file: file.originalname, title: '', action: 'error', errors: [error instanceof Error ? error.message : '无法解析文件'] });
      continue;
    }
    if (count + records.length > store.config.importMax) throw new ApiError(413, 'IMPORT_TOO_LARGE', `每次最多导入 ${store.config.importMax} 条，请拆分文件`);
    records.forEach((record, index) => {
      count++;
      let input: ArtifactInput | undefined;
      try {
        input = normalize(record, defaultStatus, store);
        store.validateMedia(input);
        const existing = store.identity(input);
        if (seenSlugs.has(input.slug) || (input.externalId && seenExternal.has(input.externalId)) || (existing && seenIds.has(existing.id))) throw new Error('本批次中出现重复 slug / externalId / 目标条目，请合并后重试');
        seenSlugs.add(input.slug);
        if (input.externalId) seenExternal.add(input.externalId);
        if (existing) seenIds.add(existing.id);
        if (existing && policy === 'error') throw new Error(`已有同标识条目：${existing.title}`);
        const action = existing ? policy === 'update' ? 'update' : 'skip' : 'create';
        rows.push({ row: index + 1, file: file.originalname, title: input.title, slug: input.slug, status: input.status, action, errors: [] });
        items.push({ input, action, existingId: existing?.id, version: existing?.version });
      } catch (error) {
        rows.push({ row: index + 1, file: file.originalname, title: input?.title || '', action: 'error', errors: [error instanceof Error ? error.message : '记录不合法'] });
      }
    });
  }
  const counts = { create: 0, update: 0, skip: 0, error: 0 };
  rows.forEach(row => counts[row.action]++);
  const timestamp = new Date().toISOString();
  const preview: ImportPreview = { id: randomUUID(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), rows, counts, canCommit: counts.error === 0 && counts.create + counts.update > 0 };
  store.db.prepare('DELETE FROM import_batches WHERE expires_at<=?').run(timestamp);
  // Keep invalid previews out of storage; the browser can display and correct their rows.
  if (preview.canCommit) store.db.prepare('INSERT INTO import_batches VALUES(?,?,?,?,?,NULL)').run(preview.id, adminId, JSON.stringify({ preview, items } satisfies Plan), timestamp, preview.expiresAt);
  return preview;
}

export function commitPreview(store: Store, id: string, adminId: string, username: string) {
  return store.transaction(() => {
    const batch = store.db.prepare('SELECT * FROM import_batches WHERE id=? AND admin_id=?').get(id, adminId);
    if (!batch || String(batch.expires_at) <= new Date().toISOString()) throw new ApiError(410, 'IMPORT_EXPIRED', '预览已过期，请重新上传并预览');
    if (batch.committed_at) throw new ApiError(409, 'IMPORT_COMMITTED', '这个批次已经导入，不能重复提交');
    const plan: Plan = JSON.parse(String(batch.plan));
    if (!plan.preview.canCommit) throw new ApiError(400, 'INVALID_IMPORT', '请先修正所有错误');
    // Validate the whole plan before writing. A stale preview never silently overwrites newer work.
    for (const item of plan.items) {
      const current = store.identity(item.input);
      if (item.existingId ? !current || current.id !== item.existingId || current.version !== item.version : !!current) throw new ApiError(409, 'IMPORT_STALE', `“${item.input.title}”在预览后发生了变化，请重新预览`);
    }
    for (const item of plan.items) {
      if (item.action === 'skip') continue;
      store.save(item.input, username, item.existingId, item.version, 'import');
    }
    store.db.prepare('UPDATE import_batches SET committed_at=? WHERE id=?').run(new Date().toISOString(), id);
    store.audit(username, 'import-batch', id, JSON.stringify(plan.preview.counts));
    return plan.preview.counts;
  });
}
