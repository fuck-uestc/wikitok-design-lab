import { z } from 'zod';
import type { ContentFormat, FeedDefinition } from './types.js';
export const feedIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);
export const formatSchema = z.enum(['long', 'short']);
export const feedDefinitionSchema = z.object({
  id: feedIdSchema, label: z.string().trim().min(1).max(30), description: z.string().trim().max(160).default(''),
  formats: z.array(formatSchema).min(1).max(2).transform(v => [...new Set(v)]), enabled: z.boolean().default(true)
}).strict();
export const feedSettingsSchema = z.object({
  feeds: z.array(feedDefinitionSchema).min(1).max(12), defaultFeed: feedIdSchema,
  version: z.number().int().positive()
}).strict().superRefine((v, ctx) => {
  if (new Set(v.feeds.map(f => f.id)).size !== v.feeds.length) ctx.addIssue({ code: 'custom', path: ['feeds'], message: '信息流 ID 不能重复' });
  if (!v.feeds.some(f => f.id === v.defaultFeed && f.enabled)) ctx.addIssue({ code: 'custom', path: ['defaultFeed'], message: '默认信息流必须已启用' });
});
export const defaultFeeds: FeedDefinition[] = [
  { id: 'main', label: '发现', description: '长文与切片，在同一页相遇。', formats: ['long', 'short'], enabled: true },
  { id: 'wiki', label: '长文', description: '事件、资料与完整的来龙去脉。', formats: ['long'], enabled: true },
  { id: 'slices', label: '切片', description: '保留原话，也保留上下文。', formats: ['short'], enabled: true }
];
export const defaultFeedIds = (format: ContentFormat): string[] => format === 'short' ? ['main', 'slices'] : ['main', 'wiki'];
export const formatLabels = { long: '长文', short: '切片' } as const;
export const shortLayoutLabels = { quote: '一句原话', image: '一张原图', comparison: '前后对照', note: '一件小事' } as const;
export const verificationLabels = { unverified: '待核对', 'source-checked': '已与来源核对', disputed: '存在异议', corrected: '已更正' } as const;
