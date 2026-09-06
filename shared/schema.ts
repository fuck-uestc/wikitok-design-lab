import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
export const httpUrl = text(2048).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, '只允许完整的 http/https 链接，不能包含用户名或密码');
const terms = z.array(text(60).min(1)).max(30).transform(v => [...new Set(v)]);
export const artifactSchema = z.object({
  title: text(200).min(1, '标题不能为空'),
  slug: text(120).regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u, '标识只能包含文字、数字、短横线和下划线').or(z.literal('')).default(''),
  summary: text(600).default(''),
  content: text(200000).min(1, '正文不能为空'),
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
}).strict().refine(v => !v.coverMediaId || !v.coverUrl, { message: '上传封面与外链封面只能选择一种', path: ['coverUrl'] });

export function slugify(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100) || 'artifact';
}
export function summarize(content: string): string {
  return content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[#*`_~>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
}
