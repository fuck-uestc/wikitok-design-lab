import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Store } from './store.js';
import { toInput } from './store.js';
import { artifactSchema } from '../../shared/schema.js';
import { ApiError } from './errors.js';

type JsonRpcId = string | number | null;
type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: unknown; isError?: boolean };

const requestSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string().min(1).max(100), params: z.unknown().optional() }).passthrough();
const artifactInputDescription = 'ArtifactInput object. title and content are required. Optional fields: slug, summary, kind (article|guide|person|event|glossary), category, tags, aliases, author, sourceUrl, sourceTitle, sourceThreadId, externalId, coverUrl, coverMediaId, coverAlt, coverCredit, eventDate (YYYY-MM-DD), status (draft|published|archived), attachmentIds.';
const artifactOutputSchema = {
  type: 'object',
  description: 'Complete saved artifact. Use id and version for subsequent updates, archive or restore operations.',
  properties: {
    id: { type: 'string' }, version: { type: 'integer', minimum: 1 }, title: { type: 'string' }, slug: { type: 'string' }, summary: { type: 'string' }, content: { type: 'string' },
    kind: { type: 'string', enum: ['article', 'guide', 'person', 'event', 'glossary'] }, status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    createdAt: { type: 'string' }, updatedAt: { type: 'string' }, publishedAt: { type: ['string', 'null'] }, tags: { type: 'array', items: { type: 'string' } }, aliases: { type: 'array', items: { type: 'string' } }, attachmentIds: { type: 'array', items: { type: 'string' } }, attachments: { type: 'array' }
  },
  required: ['id', 'version', 'title', 'slug', 'summary', 'content', 'kind', 'status', 'createdAt', 'updatedAt', 'publishedAt', 'tags', 'aliases', 'attachmentIds', 'attachments'],
  additionalProperties: true
} as const;
const tools = [
  { name: 'artifact_list', description: 'List all artifacts, including drafts and archived entries.', inputSchema: { type: 'object', properties: { q: { type: 'string' }, status: { type: 'string', enum: ['all', 'draft', 'published', 'archived'] }, page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: 'artifact_get', description: 'Get full artifact details by UUID or slug, including Markdown body, media and version.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'artifact_create', description: 'Create an artifact. The result includes its id and version for later updates.', inputSchema: { type: 'object', properties: { artifact: { type: 'object', description: artifactInputDescription } }, required: ['artifact'], additionalProperties: false }, outputSchema: artifactOutputSchema },
  { name: 'artifact_update', description: 'Replace an artifact using optimistic concurrency. Read it first and provide its current version.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'integer', minimum: 1 }, artifact: { type: 'object', description: artifactInputDescription } }, required: ['id', 'version', 'artifact'], additionalProperties: false } },
  { name: 'artifact_delete', description: 'Archive an artifact rather than physically deleting it. Read it first and provide its current version.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'integer', minimum: 1 } }, required: ['id', 'version'], additionalProperties: false } },
  { name: 'artifact_revisions', description: 'List up to 100 stored revisions for an artifact.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'artifact_restore', description: 'Restore a stored revision using optimistic concurrency.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'integer', minimum: 1 }, revision: { type: 'integer', minimum: 1 } }, required: ['id', 'version', 'revision'], additionalProperties: false } }
] as const;

const object = z.object({}).passthrough();
const text = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const toolError = (error: unknown): ToolResult => {
  if (error instanceof ApiError) return { content: [{ type: 'text', text: JSON.stringify({ code: error.code, message: error.message, details: error.details }) }], isError: true };
  if (error instanceof z.ZodError) return { content: [{ type: 'text', text: JSON.stringify({ code: 'VALIDATION_FAILED', details: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) }) }], isError: true };
  return { content: [{ type: 'text', text: JSON.stringify({ code: 'INTERNAL_ERROR', message: '服务器处理失败' }) }], isError: true };
};

function toolCall(store: Store, actor: string, name: string, raw: unknown): ToolResult {
  try {
    const args = object.parse(raw ?? {});
    if (name === 'artifact_list') {
      const input = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['all', 'draft', 'published', 'archived']).default('all'), page: z.number().int().min(1).max(100000).default(1), limit: z.number().int().min(1).max(100).default(20) }).strict().parse(args);
      return text(store.adminList({ ...input, status: input.status === 'all' ? '' : input.status }));
    }
    if (name === 'artifact_get') {
      const { id } = z.object({ id: z.string().trim().min(1).max(120) }).strict().parse(args);
      const artifact = store.get(id);
      if (!artifact) throw new ApiError(404, 'NOT_FOUND', '条目不存在');
      return text(artifact);
    }
    if (name === 'artifact_create') return text(store.save(artifactSchema.parse(z.object({ artifact: z.unknown() }).strict().parse(args).artifact), actor));
    if (name === 'artifact_update') {
      const { id, version, artifact } = z.object({ id: z.string().trim().min(1).max(120), version: z.number().int().positive(), artifact: z.unknown() }).strict().parse(args);
      return text(store.save(artifactSchema.parse(artifact), actor, id, version));
    }
    if (name === 'artifact_delete') {
      const { id, version } = z.object({ id: z.string().trim().min(1).max(120), version: z.number().int().positive() }).strict().parse(args);
      const existing = store.get(id);
      if (!existing) throw new ApiError(404, 'NOT_FOUND', '条目不存在');
      return text(store.save({ ...toInput(existing), status: 'archived' }, actor, existing.id, version, 'archive'));
    }
    if (name === 'artifact_revisions') {
      const { id } = z.object({ id: z.string().trim().min(1).max(120) }).strict().parse(args);
      if (!store.get(id)) throw new ApiError(404, 'NOT_FOUND', '条目不存在');
      return text(store.revisions(id));
    }
    if (name === 'artifact_restore') {
      const { id, version, revision } = z.object({ id: z.string().trim().min(1).max(120), version: z.number().int().positive(), revision: z.number().int().positive() }).strict().parse(args);
      const selected = store.db.prepare('SELECT snapshot FROM revisions WHERE artifact_id=? AND version=?').get(id, revision) as { snapshot?: string } | undefined;
      if (!selected?.snapshot) throw new ApiError(404, 'NOT_FOUND', '版本不存在');
      return text(store.save(artifactSchema.parse(JSON.parse(selected.snapshot)), actor, id, version, 'restore'));
    }
    return { content: [{ type: 'text', text: JSON.stringify({ code: 'TOOL_NOT_FOUND', message: '工具不存在' }) }], isError: true };
  } catch (error) { return toolError(error); }
}

function reply(res: Response, id: JsonRpcId, result: unknown) { res.type('application/json').json({ jsonrpc: '2.0', id, result }); }

export async function handleMcpRequest(req: Request, res: Response, store: Store, actor: string) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).type('application/json').json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }); return; }
  const { id, method, params } = parsed.data;
  if (method === 'notifications/initialized') { res.status(202).end(); return; }
  if (id === undefined) { res.status(202).end(); return; }
  if (method === 'initialize') { reply(res, id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'campus-bbs-wiki', version: '1.0.0' } }); return; }
  if (method === 'ping') { reply(res, id, {}); return; }
  if (method === 'tools/list') { reply(res, id, { tools }); return; }
  if (method === 'tools/call') {
    // MCP clients may add transport metadata (for example `_meta.progressToken`) to
    // a tools/call envelope. Validate the executable fields while accepting that
    // metadata; individual tool argument schemas remain strict below.
    const call = z.object({ name: z.string().min(1).max(100), arguments: z.unknown().optional() }).passthrough().safeParse(params);
    if (!call.success) { reply(res, id, { content: [{ type: 'text', text: JSON.stringify({ code: 'INVALID_PARAMS', message: 'tools/call 参数无效' }) }], isError: true }); return; }
    reply(res, id, toolCall(store, actor, call.data.name, call.data.arguments));
    return;
  }
  res.type('application/json').json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
}
