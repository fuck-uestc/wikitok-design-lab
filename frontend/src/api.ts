import type { ArtifactSummary, SiteConfig } from '../../shared/types';

declare global { interface Window { __WIKI_CONFIG__?: SiteConfig } }
export const initialConfig: SiteConfig = window.__WIKI_CONFIG__ || {
  siteName: '校园 BBS Wiki', shortName: '校园志', description: '把校园里的故事、经验和共同记忆，慢慢收藏。',
  tagline: '校园有回声，记忆有来处。', defaultTheme: 'margin', siteUrl: window.location.origin, apiBaseUrl: '/api', bbsBaseUrl: '', contactEmail: ''
};
let csrfToken = '';
export const setCsrf = (token: string) => { csrfToken = token; };
export class RequestError extends Error {
  constructor(message: string, public status: number, public code: string, public details?: { field: string; message: string }[]) { super(message); }
}
export function apiUrl(path: string) {
  return `${(window.__WIKI_CONFIG__?.apiBaseUrl || initialConfig.apiBaseUrl).replace(/\/$/, '')}${path}`;
}
export function mediaUrl(url: string) { return url.startsWith('/api/') ? apiUrl(url.slice(4)) : url; }
export function coverUrl(artifact: Pick<ArtifactSummary, 'coverMediaId' | 'coverUrl'>) {
  return artifact.coverMediaId ? apiUrl(`/media/${artifact.coverMediaId}`) : artifact.coverUrl;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('X-CSRF-Token', csrfToken);
  let response: Response;
  try { response = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' }); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new RequestError('暂时无法连接服务器，请稍后重试。', 0, 'NETWORK_ERROR'); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/admin/login' && path !== '/admin/session') window.dispatchEvent(new Event('wiki:session-expired'));
    throw new RequestError(data.error?.message || `请求失败（${response.status}）`, response.status, data.error?.code || 'REQUEST_FAILED', data.error?.details);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export function messageOf(error: unknown) {
  if (error instanceof RequestError && Array.isArray(error.details)) return `${error.message}：${error.details.map(d => `${d.field} ${d.message}`).join('；')}`;
  return error instanceof Error ? error.message : '操作失败，请重试';
}
export const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
export const jsonBody = (data: unknown) => JSON.stringify(data);
