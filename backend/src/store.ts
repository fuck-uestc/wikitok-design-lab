import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Artifact, ArtifactInput, ArtifactSummary, Media, Page, Revision, Stats, Taxonomy } from '../../shared/types.js';
import { slugify, summarize } from '../../shared/schema.js';
import { migrations } from './migrations.js';
import { ApiError } from './errors.js';
import type { Config } from './config.js';

type Row = Record<string, string | number | null>;
const value = (row: Row, key: string) => String(row[key] ?? '');
const now = () => new Date().toISOString();
export function toInput(artifact: Artifact): ArtifactInput {
  const { id: _id, version: _version, createdAt: _created, updatedAt: _updated, publishedAt: _published, attachments: _attachments, ...input } = artifact;
  return input;
}
export function toSummary(artifact: Artifact): ArtifactSummary {
  const { content: _content, attachments: _attachments, ...summary } = artifact;
  return summary;
}
export class Store {
  db: DatabaseSync;
  private transactionDepth = 0;
  constructor(public config: Config) {
    if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true });
    mkdirSync(config.uploadDir, { recursive: true });
    this.db = new DatabaseSync(config.databasePath);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    for (const migration of migrations) {
      if (this.db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version)) continue;
      this.transaction(() => {
        this.db.exec(migration.sql);
        this.db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(migration.version, now());
      });
    }
  }
  transaction<T>(work: () => T): T {
    if (this.transactionDepth) return work();
    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth++;
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.transactionDepth--; }
  }
  close() { this.db.close(); }
  audit(actor: string, action: string, target = '', detail = '') {
    this.db.prepare('INSERT INTO audit_logs(actor,action,target_id,detail,created_at) VALUES(?,?,?,?,?)').run(actor, action, target, detail, now());
  }
  media(row: Row): Media {
    return { id: value(row, 'id'), originalName: value(row, 'original_name'), mimeType: value(row, 'mime_type'), size: Number(row.size), url: `/api/media/${row.id}`, createdAt: value(row, 'created_at') };
  }
  mediaRow(id: string): Row | undefined { return this.db.prepare('SELECT * FROM media WHERE id = ?').get(id) as Row | undefined; }
  mediaVisible(id: string) {
    return !!this.db.prepare(`SELECT id FROM artifacts WHERE status = 'published' AND (cover_media_id = ? OR id IN (SELECT artifact_id FROM artifact_media WHERE media_id = ?)) LIMIT 1`).get(id, id);
  }
  hydrate(row: Row): Artifact {
    const id = value(row, 'id');
    const tags = this.db.prepare('SELECT t.name FROM tags t JOIN artifact_tags a ON a.tag_id=t.id WHERE a.artifact_id=? ORDER BY t.name').all(id) as Row[];
    const media = this.db.prepare('SELECT m.* FROM media m JOIN artifact_media a ON a.media_id=m.id WHERE a.artifact_id=? ORDER BY a.position').all(id) as Row[];
    return {
      id, title: value(row, 'title'), slug: value(row, 'slug'), summary: value(row, 'summary'), content: value(row, 'content'),
      kind: value(row, 'kind') as Artifact['kind'], category: value(row, 'category'), tags: tags.map(t => value(t, 'name')),
      aliases: JSON.parse(value(row, 'aliases')), author: value(row, 'author'), sourceUrl: value(row, 'source_url'), sourceTitle: value(row, 'source_title'), sourceThreadId: value(row, 'source_thread_id'), externalId: value(row, 'external_id'),
      coverUrl: value(row, 'cover_url'), coverMediaId: value(row, 'cover_media_id'), coverAlt: value(row, 'cover_alt'), coverCredit: value(row, 'cover_credit'), eventDate: value(row, 'event_date'),
      status: value(row, 'status') as Artifact['status'], version: Number(row.version), createdAt: value(row, 'created_at'), updatedAt: value(row, 'updated_at'), publishedAt: row.published_at ? value(row, 'published_at') : null,
      attachmentIds: media.map(m => value(m, 'id')), attachments: media.map(m => this.media(m))
    };
  }
  get(idOrSlug: string, publishedOnly = false): Artifact | null {
    const row = this.db.prepare(`SELECT * FROM artifacts WHERE (id=? OR slug=?)${publishedOnly ? " AND status='published'" : ''} LIMIT 1`).get(idOrSlug, idOrSlug) as Row | undefined;
    return row ? this.hydrate(row) : null;
  }
  identity(input: ArtifactInput): Artifact | null {
    const rows = this.db.prepare('SELECT * FROM artifacts WHERE slug=? OR (external_id IS NOT NULL AND external_id=?)').all(input.slug || slugify(input.title), input.externalId || null) as Row[];
    if (rows.length > 1) throw new ApiError(409, 'IDENTITY_CONFLICT', 'slug 与 externalId 指向了不同条目，请修正导入数据');
    return rows[0] ? this.hydrate(rows[0]) : null;
  }
  validateMedia(input: ArtifactInput) {
    if (input.coverMediaId) {
      const cover = this.mediaRow(input.coverMediaId);
      if (!cover || !value(cover, 'mime_type').startsWith('image/')) throw new ApiError(400, 'INVALID_COVER', '封面必须是已上传的图片');
    }
    for (const id of input.attachmentIds) if (!this.mediaRow(id)) throw new ApiError(400, 'MISSING_ATTACHMENT', `附件不存在：${id}`);
  }
  save(input: ArtifactInput, actor: string, id?: string, expectedVersion?: number, action?: string): Artifact {
    return this.transaction(() => {
      const existing = id ? this.get(id) : null;
      if (id && !existing) throw new ApiError(404, 'NOT_FOUND', '条目不存在');
      if (existing && expectedVersion !== existing.version) throw new ApiError(409, 'VERSION_CONFLICT', '条目已被其他操作更新，请重新载入后再保存');
      this.validateMedia(input);
      const data = { ...input, slug: input.slug || slugify(input.title), summary: input.summary || summarize(input.content) };
      const conflict = this.identity(data);
      if (conflict && conflict.id !== id) throw new ApiError(409, 'DUPLICATE_ARTIFACT', `标识或外部 ID 已存在：${conflict.title}`);
      const artifactId = id || randomUUID();
      const timestamp = now();
      const version = existing ? existing.version + 1 : 1;
      const publishedAt = data.status === 'published' ? existing?.publishedAt || timestamp : existing?.publishedAt || null;
      const columns: Record<string, SQLInputValue> = {
        slug: data.slug, external_id: data.externalId || null, title: data.title, summary: data.summary, content: data.content, kind: data.kind, category: data.category, aliases: JSON.stringify(data.aliases),
        author: data.author, source_url: data.sourceUrl, source_title: data.sourceTitle, source_thread_id: data.sourceThreadId,
        cover_url: data.coverUrl, cover_media_id: data.coverMediaId, cover_alt: data.coverAlt, cover_credit: data.coverCredit, event_date: data.eventDate,
        status: data.status, version, updated_at: timestamp, published_at: publishedAt
      };
      if (existing) {
        this.db.prepare(`UPDATE artifacts SET ${Object.keys(columns).map(k => `${k}=?`).join(',')} WHERE id=?`).run(...Object.values(columns), artifactId);
      } else {
        const fields = { id: artifactId, ...columns, created_at: timestamp };
        this.db.prepare(`INSERT INTO artifacts(${Object.keys(fields).join(',')}) VALUES(${Object.keys(fields).map(() => '?').join(',')})`).run(...Object.values(fields));
      }
      this.db.prepare('DELETE FROM artifact_tags WHERE artifact_id=?').run(artifactId);
      for (const tag of data.tags) {
        this.db.prepare('INSERT OR IGNORE INTO tags(name) VALUES(?)').run(tag);
        this.db.prepare('INSERT INTO artifact_tags(artifact_id,tag_id) SELECT ?,id FROM tags WHERE name=?').run(artifactId, tag);
      }
      this.db.prepare('DELETE FROM artifact_media WHERE artifact_id=?').run(artifactId);
      data.attachmentIds.forEach((mediaId, position) => this.db.prepare('INSERT INTO artifact_media VALUES(?,?,?)').run(artifactId, mediaId, position));
      const revisionAction = action || (existing ? 'update' : 'create');
      this.db.prepare('INSERT INTO revisions(artifact_id,version,action,actor,snapshot,created_at) VALUES(?,?,?,?,?,?)').run(artifactId, version, revisionAction, actor, JSON.stringify(data), timestamp);
      this.audit(actor, revisionAction, artifactId, `version=${version};status=${data.status}`);
      return this.get(artifactId)!;
    });
  }
  filter(query: { q?: string; category?: string; tag?: string; status?: string; ids?: string[] }, admin = false) {
    const conditions = admin ? ['1=1'] : ["a.status='published'"];
    const params: SQLInputValue[] = [];
    if (admin && query.status) { conditions.push('a.status=?'); params.push(query.status); }
    if (query.category) { conditions.push('a.category=?'); params.push(query.category); }
    if (query.tag) { conditions.push('EXISTS(SELECT 1 FROM artifact_tags at JOIN tags t ON t.id=at.tag_id WHERE at.artifact_id=a.id AND t.name=?)'); params.push(query.tag); }
    if (query.ids) {
      conditions.push(`a.id IN (${query.ids.map(() => '?').join(',') || 'NULL'})`); params.push(...query.ids);
    }
    if (query.q) {
      const term = `%${query.q.normalize('NFKC').replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(`(a.title LIKE ? ESCAPE '\\' OR a.summary LIKE ? ESCAPE '\\' OR a.content LIKE ? ESCAPE '\\' OR a.aliases LIKE ? ESCAPE '\\' OR a.author LIKE ? ESCAPE '\\' OR a.source_thread_id LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM artifact_tags at JOIN tags t ON t.id=at.tag_id WHERE at.artifact_id=a.id AND t.name LIKE ? ESCAPE '\\'))`);
      params.push(...Array<SQLInputValue>(7).fill(term));
    }
    return { where: conditions.join(' AND '), params };
  }
  list(query: { q?: string; category?: string; tag?: string; ids?: string[]; cursor?: string; limit: number }): Page<ArtifactSummary> {
    const { where, params } = this.filter(query);
    const total = Number(this.db.prepare(`SELECT COUNT(*) n FROM artifacts a WHERE ${where}`).get(...params)?.n);
    let cursorWhere = '';
    const cursorParams: SQLInputValue[] = [];
    if (query.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
        if (typeof cursor.date !== 'string' || typeof cursor.id !== 'string' || cursor.date.length > 40 || cursor.id.length > 64) throw new Error();
        cursorWhere = ' AND (a.published_at < ? OR (a.published_at = ? AND a.id < ?))'; cursorParams.push(cursor.date, cursor.date, cursor.id);
      } catch { throw new ApiError(400, 'INVALID_CURSOR', '分页游标无效，请重新加载'); }
    }
    const rows = this.db.prepare(`SELECT a.* FROM artifacts a WHERE ${where}${cursorWhere} ORDER BY a.published_at DESC,a.id DESC LIMIT ?`).all(...params, ...cursorParams, query.limit + 1) as Row[];
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return { items: page.map(row => toSummary(this.hydrate(row))), total, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ date: last.published_at, id: last.id })).toString('base64url') : null };
  }
  adminList(query: { q?: string; status?: string; page: number; limit: number }) {
    const { where, params } = this.filter(query, true);
    const total = Number(this.db.prepare(`SELECT COUNT(*) n FROM artifacts a WHERE ${where}`).get(...params)?.n);
    const rows = this.db.prepare(`SELECT a.* FROM artifacts a WHERE ${where} ORDER BY a.updated_at DESC,a.id DESC LIMIT ? OFFSET ?`).all(...params, query.limit, (query.page - 1) * query.limit) as Row[];
    return { items: rows.map(row => toSummary(this.hydrate(row))), total, page: query.page, pages: Math.ceil(total / query.limit) };
  }
  random(category = ''): ArtifactSummary | null {
    const row = this.db.prepare(`SELECT * FROM artifacts WHERE status='published'${category ? ' AND category=?' : ''} ORDER BY random() LIMIT 1`).get(...(category ? [category] : [])) as Row | undefined;
    return row ? toSummary(this.hydrate(row)) : null;
  }
  taxonomy(): Taxonomy {
    const categories = this.db.prepare("SELECT category name,COUNT(*) count FROM artifacts WHERE status='published' AND category<>'' GROUP BY category ORDER BY count DESC,name").all() as Row[];
    const tags = this.db.prepare("SELECT t.name,COUNT(*) count FROM tags t JOIN artifact_tags at ON t.id=at.tag_id JOIN artifacts a ON a.id=at.artifact_id WHERE a.status='published' GROUP BY t.id ORDER BY count DESC,t.name LIMIT 100").all() as Row[];
    return { categories: categories.map(r => ({ name: value(r, 'name'), count: Number(r.count) })), tags: tags.map(r => ({ name: value(r, 'name'), count: Number(r.count) })) };
  }
  revisions(id: string): Revision[] {
    return (this.db.prepare('SELECT * FROM revisions WHERE artifact_id=? ORDER BY version DESC LIMIT 100').all(id) as Row[]).map(r => ({ id: Number(r.id), version: Number(r.version), action: value(r, 'action'), actor: value(r, 'actor'), createdAt: value(r, 'created_at'), snapshot: JSON.parse(value(r, 'snapshot')) }));
  }
  stats(): Stats {
    const count = (table: string, status?: string) => Number(this.db.prepare(`SELECT COUNT(*) n FROM ${table}${status ? ' WHERE status=?' : ''}`).get(...(status ? [status] : []))?.n);
    return { published: count('artifacts', 'published'), draft: count('artifacts', 'draft'), archived: count('artifacts', 'archived'), media: count('media'), revisions: count('revisions'), recent: this.adminList({ page: 1, limit: 6 }).items };
  }
}
