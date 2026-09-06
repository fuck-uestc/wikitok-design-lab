import { createHash, randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Store } from './store.js';
import type { Config } from './config.js';
import { ApiError } from './errors.js';

export interface AuthUser { id: string; username: string; csrfToken: string; expiresAt: string; tokenHash: string }
declare global { namespace Express { interface Request { admin?: AuthUser } } }
export const cookieName = 'bbswiki_session';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [format, salt, hash] = stored.split(':');
  if (format !== 'scrypt' || !salt || !hash) return false;
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }, (error, key) => {
    if (error) { reject(error); return; }
    const expected = Buffer.from(hash, 'hex');
    resolve(expected.length === key.length && timingSafeEqual(expected, key));
  }));
}
export function bootstrapAdmin(store: Store) {
  if (store.db.prepare('SELECT id FROM admins LIMIT 1').get()) return;
  const { adminUsername, adminPassword } = store.config;
  if (adminPassword.length < 12) throw new Error('首次启动需要至少 12 位 ADMIN_PASSWORD。先运行 npm run setup，再检查 .env。');
  store.db.prepare('INSERT INTO admins VALUES(?,?,?,?)').run(randomUUID(), adminUsername, hashPassword(adminPassword), new Date().toISOString());
  store.audit(adminUsername, 'bootstrap-admin');
}
export function createAuth(store: Store, config: Config) {
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const cookieOptions = { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/api' } as const;
  function session(req: Request): AuthUser | undefined {
    const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const tokenHash = hashToken(token);
    const row = store.db.prepare('SELECT a.id,a.username,s.csrf_token,s.expires_at FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash, new Date().toISOString());
    if (!row) return;
    return { id: String(row.id), username: String(row.username), csrfToken: String(row.csrf_token), expiresAt: String(row.expires_at), tokenHash };
  }
  function requireAdmin(req: Request, _res: Response, next: NextFunction) {
    req.admin = session(req);
    if (!req.admin) { next(new ApiError(401, 'UNAUTHENTICATED', '登录已过期，请重新登录')); return; }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const supplied = req.header('x-csrf-token') || '';
      const expected = req.admin.csrfToken;
      if (!/^[A-Za-z0-9_-]{43}$/.test(supplied) || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) { next(new ApiError(403, 'CSRF_INVALID', '请求校验失败，请刷新页面后重试')); return; }
    }
    next();
  }
  async function login(username: string, password: string, res: Response) {
    const row = store.db.prepare('SELECT * FROM admins WHERE username=?').get(username);
    const valid = await verifyPassword(password, row ? String(row.password_hash) : dummyHash);
    if (!row || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionHours * 3600_000).toISOString();
    store.transaction(() => {
      store.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(new Date().toISOString());
      store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hashToken(token), String(row.id), csrfToken, expiresAt);
      store.audit(username, 'login');
    });
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: config.sessionHours * 3600_000 });
    return { username, csrfToken, expiresAt };
  }
  async function mcpActor(token: string): Promise<{ actor: string; readOnly: boolean } | undefined> {
    if (token.length > 256) return;
    const matches = (expected: string) => !!expected && timingSafeEqual(Buffer.from(hashToken(token)), Buffer.from(hashToken(expected)));
    if (matches(config.mcpToken)) return { actor: 'mcp:write', readOnly: false };
    if (matches(config.mcpReadToken)) return { actor: 'mcp:read', readOnly: true };
    // Existing deployments predate dedicated MCP tokens and deliberately use
    // the current admin password as their Bearer token. Keep that contract
    // when neither dedicated token is configured, without weakening an
    // explicitly configured token-based deployment.
    if (!config.mcpAllowAdminPassword && (config.mcpToken || config.mcpReadToken)) return;
    const row = store.db.prepare('SELECT username,password_hash FROM admins ORDER BY created_at LIMIT 1').get() as { username?: string; password_hash?: string } | undefined;
    const valid = await verifyPassword(token, row?.password_hash || dummyHash);
    return row && valid ? { actor: `${row.username}:mcp-legacy`, readOnly: false } : undefined;
  }
  function logout(user: AuthUser, res: Response) {
    store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.tokenHash);
    res.clearCookie(cookieName, cookieOptions);
    store.audit(user.username, 'logout');
  }
  async function changePassword(user: AuthUser, current: string, replacement: string, res: Response) {
    const row = store.db.prepare('SELECT password_hash FROM admins WHERE id=?').get(user.id)!;
    if (!await verifyPassword(current, String(row.password_hash))) throw new ApiError(400, 'WRONG_PASSWORD', '当前密码不正确');
    const passwordHash = hashPassword(replacement);
    store.transaction(() => {
      store.db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(passwordHash, user.id);
      store.db.prepare('DELETE FROM sessions WHERE admin_id=?').run(user.id);
      store.audit(user.username, 'change-password');
    });
    res.clearCookie(cookieName, cookieOptions);
  }
  return { session, requireAdmin, login, logout, changePassword, mcpActor };
}
