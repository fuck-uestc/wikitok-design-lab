import 'dotenv/config';
import { resolve } from 'node:path';
import type { SiteConfig } from '../../shared/types.js';

export interface Config {
  env: string; host: string; port: number; root: string;
  databasePath: string; uploadDir: string; backupDir: string;
  adminUsername: string; adminPassword: string; sessionHours: number;
  cookieSecure: boolean; cookieSameSite: 'lax' | 'strict' | 'none'; trustProxy: number;
  origins: string[]; uploadMb: number; importMb: number; importMax: number;
  threadUrlTemplate: string; site: SiteConfig;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = process.cwd();
  const integer = (key: string, fallback: number, min = 1, max = 65535) => {
    const value = Number(env[key] || fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} 必须是 ${min}–${max} 的整数`);
    return value;
  };
  const url = (key: string, fallback = '') => {
    const value = (env[key] ?? fallback).trim().replace(/\/$/, '');
    if (value) { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${key} 必须是 http/https URL`); }
    return value;
  };
  const boolean = (key: string, fallback: boolean) => {
    const value = env[key] || String(fallback);
    if (!['true', 'false'].includes(value)) throw new Error(`${key} 必须为 true 或 false`);
    return value === 'true';
  };
  const port = integer('BACKEND_PORT', 3001);
  const production = env.NODE_ENV === 'production';
  const siteUrl = url('PUBLIC_SITE_URL', `http://localhost:${port}`);
  const apiBaseUrl = (env.PUBLIC_API_BASE_URL || '/api').replace(/\/$/, '');
  if (apiBaseUrl !== '/api' && !/^https?:\/\/[^\s]+\/api$/.test(apiBaseUrl)) throw new Error('PUBLIC_API_BASE_URL 必须为 /api 或完整的 http(s)://host/api');
  if (apiBaseUrl !== '/api') { const parsed = new URL(apiBaseUrl); if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('PUBLIC_API_BASE_URL 不能包含认证、查询参数或片段'); }
  const cookieSameSite = env.COOKIE_SAME_SITE || 'lax';
  if (!['lax', 'strict', 'none'].includes(cookieSameSite)) throw new Error('COOKIE_SAME_SITE 必须为 lax、strict 或 none');
  const cookieSecure = boolean('COOKIE_SECURE', production);
  if (production && (!cookieSecure || !siteUrl.startsWith('https://'))) throw new Error('生产模式需要 COOKIE_SECURE=true 与 HTTPS PUBLIC_SITE_URL');
  if (cookieSameSite === 'none' && !cookieSecure) throw new Error('SameSite=None 需要 COOKIE_SECURE=true');
  const theme = env.DEFAULT_THEME || 'margin';
  if (!['margin', 'drift'].includes(theme)) throw new Error('DEFAULT_THEME 只能为 margin 或 drift');
  const origins = [...new Set([new URL(siteUrl).origin, ...(env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)])];
  for (const origin of origins) { if (new URL(origin).origin !== origin || !/^https?:/.test(origin)) throw new Error('CORS_ORIGINS 只能包含完整 origin，不能使用 * 或路径'); }
  const threadUrlTemplate = env.BBS_THREAD_URL_TEMPLATE?.trim() || '';
  if (threadUrlTemplate && (!threadUrlTemplate.includes('{id}') || !/^https?:\/\//.test(threadUrlTemplate))) throw new Error('BBS_THREAD_URL_TEMPLATE 需要 http(s) URL 和 {id} 占位符');
  return {
    env: env.NODE_ENV || 'development', root, host: env.BACKEND_HOST || '127.0.0.1', port,
    databasePath: env.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(root, env.DATABASE_PATH || 'data/wiki.sqlite'),
    uploadDir: resolve(root, env.UPLOAD_DIR || 'uploads'), backupDir: resolve(root, env.BACKUP_DIR || 'backups'),
    adminUsername: env.ADMIN_USERNAME || 'admin', adminPassword: env.ADMIN_PASSWORD || '',
    sessionHours: integer('SESSION_TTL_HOURS', 12, 1, 168), cookieSecure, cookieSameSite: cookieSameSite as Config['cookieSameSite'],
    trustProxy: integer('TRUST_PROXY', 0, 0, 5), origins,
    uploadMb: integer('MAX_UPLOAD_MB', 10, 1, 50), importMb: integer('MAX_IMPORT_MB', 5, 1, 20), importMax: integer('IMPORT_MAX_RECORDS', 500, 1, 2000), threadUrlTemplate,
    site: { siteName: env.SITE_NAME || '校园 BBS Wiki', shortName: env.SITE_SHORT_NAME || '校园志', description: env.SITE_DESCRIPTION || '把校园里的故事、经验和共同记忆，慢慢收藏。', tagline: env.SITE_TAGLINE || '校园有回声，记忆有来处。', defaultTheme: theme as SiteConfig['defaultTheme'], siteUrl, apiBaseUrl, bbsBaseUrl: url('BBS_BASE_URL'), contactEmail: env.CONTACT_EMAIL || '' }
  };
}
