import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.js';
import { Store, toInput } from './store.js';
import { bootstrapAdmin, createAuth } from './auth.js';
import { ApiError } from './errors.js';
import { artifactSchema } from '../../shared/schema.js';
import { commitPreview, createPreview } from './imports.js';
import { uploadMedia } from './media.js';
import { handleMcpRequest } from './mcp.js';

export function runtimeScript(site: Config['site']) {
  return `window.__WIKI_CONFIG__=${JSON.stringify(site).replace(/</g, '\\u003c')};`;
}
export function createApp(config: Config) {
  const store = new Store(config);
  try { bootstrapAdmin(store); } catch (error) { store.close(); throw error; }
  const auth = createAuth(store, config);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'], connectSrc: ["'self'", ...(config.site.apiBaseUrl.startsWith('http') ? [new URL(config.site.apiBaseUrl).origin] : [])],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null
    } },
    strictTransportSecurity: config.env === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false
  }));
  app.use(cors({ credentials: true, origin(origin, callback) {
    if (!origin || config.origins.includes(origin)) callback(null, true);
    else callback(new ApiError(403, 'ORIGIN_DENIED', '此来源不在 CORS_ORIGINS 中'));
  } }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } } }));
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', (_req, res) => {
    store.db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  app.get('/runtime-config.js', (_req, res) => { res.set('Cache-Control', 'no-store').type('application/javascript').send(runtimeScript(config.site)); });
  app.get('/api/config', (_req, res) => res.json(config.site));
  app.get('/api/taxonomy', (_req, res) => res.json(store.taxonomy()));
  app.get('/api/artifacts', (req, res) => {
    const query = z.object({ q: z.string().trim().max(100).optional(), category: z.string().max(60).optional(), tag: z.string().max(60).optional(), cursor: z.string().max(500).optional(), ids: z.string().max(6500).optional(), limit: z.coerce.number().int().min(1).max(100).default(12) }).parse(req.query);
    const ids = query.ids === undefined ? undefined : query.ids.split(',').filter(Boolean);
    if (ids && (ids.length > 100 || ids.some(id => id.length > 64))) throw new ApiError(400, 'INVALID_IDS', '每次最多查询 100 个条目 ID');
    res.json(store.list({ ...query, ids }));
  });
  app.get('/api/artifacts/random', (req, res) => {
    const { category } = z.object({ category: z.string().max(60).optional() }).parse(req.query);
    const artifact = store.random(category);
    if (!artifact) throw new ApiError(404, 'NOT_FOUND', '暂时没有已发布的条目');
    res.json(artifact);
  });
  app.get('/api/artifacts/:id', (req, res) => {
    const artifact = store.get(String(req.params.id), true);
    if (!artifact) throw new ApiError(404, 'NOT_FOUND', '条目不存在或尚未公开');
    res.json(artifact);
  });
  app.get('/api/media/:id', (req, res, next) => {
    const row = store.mediaRow(String(req.params.id));
    if (!row || (!store.mediaVisible(String(req.params.id)) && !auth.session(req))) throw new ApiError(404, 'NOT_FOUND', '文件不存在或尚未公开');
    const filename = String(row.filename);
    if (!/^[a-f0-9-]+\.(png|jpg|gif|webp|pdf|txt)$/.test(filename)) throw new ApiError(404, 'NOT_FOUND', '文件不可用');
    res.type(String(row.mime_type));
    if (!String(row.mime_type).startsWith('image/')) res.attachment(String(row.original_name));
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(config.uploadDir, filename), { cacheControl: false }, error => { if (error) next(new ApiError(404, 'NOT_FOUND', '文件已丢失，请联系管理员')); });
  });
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: { code: 'LOGIN_LIMITED', message: '登录尝试过多，请在 15 分钟后重试' } } });
  const mcpLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'MCP_RATE_LIMITED', message: 'MCP 请求过于频繁，请稍后再试' } } });
  app.post('/mcp', mcpLimiter, async (req, res, next) => {
    try {
      const authorization = req.header('authorization') || '';
      const match = /^Bearer\s+(.+)$/i.exec(authorization);
      const actor = match && await auth.mcpActor(match[1]);
      if (!actor) { res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: { code: 'MCP_UNAUTHENTICATED', message: '需要有效的 Bearer Token' } }); return; }
      await handleMcpRequest(req, res, store, actor);
    } catch (error) { next(error); }
  });
  app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const input = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(256) }).strict().parse(req.body);
    res.json(await auth.login(input.username, input.password, res));
  });
  app.use('/api/admin', auth.requireAdmin);
  app.get('/api/admin/session', (req, res) => res.json({ username: req.admin!.username, csrfToken: req.admin!.csrfToken, expiresAt: req.admin!.expiresAt }));
  app.post('/api/admin/logout', (req, res) => { auth.logout(req.admin!, res); res.status(204).end(); });
  app.post('/api/admin/password', loginLimiter, async (req, res) => {
    const input = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) }).strict().parse(req.body);
    await auth.changePassword(req.admin!, input.currentPassword, input.newPassword, res);
    res.status(204).end();
  });
  app.get('/api/admin/stats', (_req, res) => res.json(store.stats()));
  app.get('/api/admin/settings', (_req, res) => res.json({ site: config.site, limits: { uploadMb: config.uploadMb, importMb: config.importMb, importMaxRecords: config.importMax, maxFiles: 20 } }));
  app.get('/api/admin/artifacts', (req, res) => {
    const query = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['draft', 'published', 'archived', '']).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    res.json(store.adminList(query));
  });
  app.post('/api/admin/artifacts', (req, res) => res.status(201).json(store.save(artifactSchema.parse(req.body), req.admin!.username)));
  app.get('/api/admin/artifacts/:id', (req, res) => {
    const artifact = store.get(String(req.params.id));
    if (!artifact) throw new ApiError(404, 'NOT_FOUND', '条目不存在');
    res.json(artifact);
  });
  app.put('/api/admin/artifacts/:id', (req, res) => {
    const { version, ...raw } = z.object({ version: z.number().int().positive() }).passthrough().parse(req.body);
    res.json(store.save(artifactSchema.parse(raw), req.admin!.username, String(req.params.id), version));
  });
  app.delete('/api/admin/artifacts/:id', (req, res) => {
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
    const existing = store.get(String(req.params.id));
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '条目不存在');
    res.json(store.save({ ...toInput(existing), status: 'archived' }, req.admin!.username, existing.id, version, 'archive'));
  });
  app.get('/api/admin/artifacts/:id/revisions', (req, res) => {
    const existing = store.get(String(req.params.id));
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '条目不存在');
    res.json(store.revisions(existing.id));
  });
  app.post('/api/admin/artifacts/:id/restore', (req, res) => {
    const { version, revision } = z.object({ version: z.number().int().positive(), revision: z.number().int().positive() }).strict().parse(req.body);
    const id = String(req.params.id);
    const selected = store.db.prepare('SELECT snapshot FROM revisions WHERE artifact_id=? AND version=?').get(id, revision);
    if (!selected) throw new ApiError(404, 'NOT_FOUND', '版本不存在');
    res.json(store.save(artifactSchema.parse(JSON.parse(String(selected.snapshot))), req.admin!.username, id, version, 'restore'));
  });
  const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadMb * 1024 * 1024, files: 20, fields: 0, parts: 20 } });
  const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.importMb * 1024 * 1024, files: 20, fields: 2, fieldSize: 100, parts: 22 } });
  const filesOf = (files: Express.Multer.File[] | { [key: string]: Express.Multer.File[] } | undefined) => {
    if (!Array.isArray(files) || files.length === 0) throw new ApiError(400, 'MISSING_FILES', '请选择要上传的文件');
    for (const file of files) {
      if (/^[\x00-\xff]+$/.test(file.originalname)) {
        try { file.originalname = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(file.originalname, 'latin1')); } catch { /* Already decoded or Latin-1 name. */ }
      }
    }
    return files;
  };
  app.post('/api/admin/media', mediaUpload.array('files', 20), (req, res) => res.status(201).json({ items: uploadMedia(store, filesOf(req.files), req.admin!.username) }));
  app.get('/api/admin/media', (req, res) => {
    const query = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const rows = store.db.prepare('SELECT * FROM media ORDER BY created_at DESC LIMIT 50 OFFSET ?').all((query.page - 1) * 50);
    res.json({ items: rows.map(row => store.media(row as Record<string, string | number | null>)), total: Number(store.db.prepare('SELECT COUNT(*) n FROM media').get()?.n) });
  });
  app.post('/api/admin/imports/preview', importUpload.array('files', 20), (req, res) => {
    const { policy, defaultStatus } = z.object({ policy: z.enum(['skip', 'update', 'error']).default('skip'), defaultStatus: z.enum(['draft', 'published']).default('draft') }).strict().parse(req.body);
    res.json(createPreview(store, filesOf(req.files), req.admin!.id, policy, defaultStatus));
  });
  app.post('/api/admin/imports/:id/commit', (req, res) => res.json(commitPreview(store, String(req.params.id), req.admin!.id, req.admin!.username)));
  app.get('/api/admin/export', (_req, res) => {
    const artifacts = store.db.prepare('SELECT * FROM artifacts ORDER BY created_at').all().map(row => toInput(store.hydrate(row as Record<string, string | number | null>)));
    res.attachment(`campus-wiki-${new Date().toISOString().slice(0, 10)}.json`).json({ schemaVersion: 1, exportedAt: new Date().toISOString(), artifacts });
  });
  app.get('/api/admin/audit', (_req, res) => res.json(store.db.prepare('SELECT actor,action,target_id AS targetId,detail,created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT 100').all()));
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'ENDPOINT_NOT_FOUND', 'API 路径不存在')));
  const client = join(config.root, 'dist/client');
  app.use(express.static(client, { index: false, dotfiles: 'deny', setHeaders(res, path) {
    res.set('Cache-Control', path.includes(`${join('assets', '')}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  } }));
  app.get('/{*path}', (_req, res) => {
    const index = join(client, 'index.html');
    if (existsSync(index)) res.set('Cache-Control', 'no-cache').sendFile(index);
    else res.status(404).type('text/plain').send('前端尚未构建。开发时访问 http://localhost:5173；生产前请运行 npm run build。');
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof ApiError) { res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } }); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '输入内容不符合要求', details: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) } }); return; }
    if (error instanceof multer.MulterError) { res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: error.code, message: error.code === 'LIMIT_FILE_SIZE' ? '文件超过大小限制，请拆分或压缩后重试' : '上传数量或字段不符合要求' } }); return; }
    const failure = error as { status?: number; code?: string };
    if (failure.status === 400 || failure.status === 413) { res.status(failure.status).json({ error: { code: 'INVALID_BODY', message: failure.status === 413 ? '请求内容过大' : '请求内容不是有效 JSON' } }); return; }
    console.error('Request failed:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器处理失败，请稍后重试' } });
  };
  app.use(errorHandler);
  return { app, store, close: () => store.close() };
}
