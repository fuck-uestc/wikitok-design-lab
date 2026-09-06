import { z } from 'zod';
import { defaultFeedIds, feedIdSchema, formatSchema } from './feeds.js';

const text = (max: number) => z.string().trim().max(max);
export const httpUrl = text(2048).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, '只允许完整的 http/https 链接，不能包含用户名或密码');
const terms = z.array(text(60).min(1)).max(30).transform(v => [...new Set(v)]);
const sourceSchema = z.object({
  label: text(200).min(1), url: httpUrl.default(''), mediaId: text(64).default(''),
  excerpt: text(3000).default(''), date: text(40).default('')
}).strict();
export const shortContentSchema = z.object({
  layout: z.enum(['quote', 'image', 'comparison', 'note']).default('quote'),
  text: text(1600).default(''), context: text(600).default(''), attribution: text(120).default(''),
  verification: z.enum(['unverified', 'source-checked', 'disputed', 'corrected']).default('unverified'),
  sources: z.array(sourceSchema).max(8).default([]),
  comparison: z.array(z.object({ label: text(80).default(''), text: text(800).min(1), sourceIndex: z.number().int().min(0).max(7).nullable().default(null) }).strict()).max(2).default([]),
  correction: text(2000).default('')
}).strict();
export const artifactObjectSchema = z.object({
  format: formatSchema.default('long'),
  feedIds: z.array(feedIdSchema).max(12).transform(v => [...new Set(v)]).optional(),
  short: shortContentSchema.nullable().default(null),
  title: text(200).min(1, '标题不能为空'),
  slug: text(120).regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u, '标识只能包含文字、数字、短横线和下划线').or(z.literal('')).default(''),
  summary: text(600).default(''),
  content: text(200000).default(''),
  kind: z.enum(['article', 'guide', 'person', 'event', 'glossary']).default('article'),
  category: text(60).default(''),
  tags: terms.default([]),
  aliases: terms.default([]),
  author: text(100).default(''),
  sourceUrl: httpUrl.default(''),
  sourceTitle: text(200).default(''),
  sourceThreadId: text(100).default(''),
  externalId: text(200).default(''),
  coverUrl: httpUrl.default(''),
  coverMediaId: text(64).default(''),
  coverAlt: text(300).default(''),
  coverCredit: text(500).default(''),
  eventDate: text(10).refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v)), '日期格式为 YYYY-MM-DD').default(''),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  attachmentIds: z.array(text(64).min(1)).max(20).transform(v => [...new Set(v)]).default([])
}).strict();
export const artifactSchema = artifactObjectSchema.refine(v => !v.coverMediaId || !v.coverUrl, { message: '上传封面与外链封面只能选择一种', path: ['coverUrl'] }).superRefine((v, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (v.format === 'long' && !v.content) issue(['content'], '长文必须填写正文');
  if (v.format !== 'short') return;
  if (!v.short) { issue(['short'], '切片必须填写 short 内容'); return; }
  if (['quote', 'note'].includes(v.short.layout) && !v.short.text) issue(['short', 'text'], '请填写原话或行为概述');
  if (v.short.layout === 'image' && !v.coverMediaId && !v.coverUrl) issue(['coverMediaId'], '原图卡片必须上传图片或填写图片链接');
  if (v.short.layout === 'comparison' && v.short.comparison.length !== 2) issue(['short', 'comparison'], '前后对照需要两段内容');
  v.short.comparison.forEach((side, i) => { if (side.sourceIndex !== null && side.sourceIndex >= v.short!.sources.length) issue(['short', 'comparison', i, 'sourceIndex'], '对应来源不存在'); });
  if (v.short.verification === 'source-checked' && !v.sourceUrl && !v.short.sources.some(s => s.url || s.mediaId)) issue(['short', 'verification'], '标记已核对前，请提供来源链接或附件');
  if (v.short.verification === 'source-checked' && v.short.layout === 'comparison') v.short.comparison.forEach((side, i) => { const source = side.sourceIndex === null ? undefined : v.short!.sources[side.sourceIndex]; if (!source || !(source.url || source.mediaId)) issue(['short', 'comparison', i, 'sourceIndex'], '已核对的对照内容，每一侧都需要关联来源链接或附件。'); });
  if (v.short.verification === 'corrected' && !v.short.correction) issue(['short', 'correction'], '请填写更正说明');
}).transform(v => ({ ...v, feedIds: v.feedIds ?? defaultFeedIds(v.format), short: v.format === 'short' ? v.short : null }));

export function slugify(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100) || 'artifact';
}
export function summarize(content: string): string {
  return content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[#*`_~>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
}
