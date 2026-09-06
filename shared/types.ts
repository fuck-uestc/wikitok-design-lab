export type Theme = 'margin' | 'drift';
export type ContentFormat = 'long' | 'short';
export type ShortLayout = 'quote' | 'image' | 'comparison' | 'note';
export interface SourceMaterial { label: string; url: string; mediaId: string; excerpt: string; date: string }
export interface ShortContent {
  layout: ShortLayout; text: string; context: string; attribution: string;
  verification: 'unverified' | 'source-checked' | 'disputed' | 'corrected';
  sources: SourceMaterial[]; comparison: { label: string; text: string; sourceIndex: number | null }[]; correction: string;
}
export interface FeedDefinition { id: string; label: string; description: string; formats: ContentFormat[]; enabled: boolean }
export interface FeedSettings { feeds: FeedDefinition[]; defaultFeed: string; version: number }
export type ArtifactStatus = 'draft' | 'published' | 'archived';
export type ArtifactKind = 'article' | 'guide' | 'person' | 'event' | 'glossary';
export interface SiteConfig {
  feeds: FeedDefinition[];
  defaultFeed: string;
  siteName: string;
  shortName: string;
  description: string;
  tagline: string;
  defaultTheme: Theme;
  siteUrl: string;
  apiBaseUrl: string;
  bbsBaseUrl: string;
  contactEmail: string;
}
export interface Media {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}
export interface ArtifactInput {
  format: ContentFormat;
  feedIds: string[];
  short: ShortContent | null;
  title: string;
  slug: string;
  summary: string;
  content: string;
  kind: ArtifactKind;
  category: string;
  tags: string[];
  aliases: string[];
  author: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceThreadId: string;
  externalId: string;
  coverUrl: string;
  coverMediaId: string;
  coverAlt: string;
  coverCredit: string;
  eventDate: string;
  status: ArtifactStatus;
  attachmentIds: string[];
}
export interface Artifact extends ArtifactInput {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  attachments: Media[];
}
export type ArtifactSummary = Omit<Artifact, 'content' | 'attachments'>;
export interface Page<T> { items: T[]; total: number; nextCursor: string | null }
export interface Taxonomy { categories: { name: string; count: number }[]; tags: { name: string; count: number }[] }
export interface AdminSession { username: string; csrfToken: string; expiresAt: string }
export interface Stats { published: number; draft: number; archived: number; media: number; revisions: number; recent: ArtifactSummary[] }
export type ImportPolicy = 'skip' | 'update' | 'error';
export interface ImportRow { row: number; file: string; title: string; action: 'create' | 'update' | 'skip' | 'error'; errors: string[]; slug?: string; status?: ArtifactStatus }
export interface ImportPreview { id: string; expiresAt: string; rows: ImportRow[]; counts: Record<'create' | 'update' | 'skip' | 'error', number>; canCommit: boolean }
export interface Revision { id: number; version: number; action: string; actor: string; createdAt: string; snapshot: ArtifactInput }
export const kindLabels: Record<ArtifactKind, string> = { article: '校园故事', guide: '实用指南', person: '校园人物', event: '校园事件', glossary: '社区词典' };
export const statusLabels: Record<ArtifactStatus, string> = { draft: '草稿', published: '已发布', archived: '已归档' };
