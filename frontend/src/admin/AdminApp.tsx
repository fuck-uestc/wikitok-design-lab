import { createContext, useContext, useEffect, useLayoutEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Asterisk, ArrowUpRight, LayoutDashboard, Files, Upload, Images, Settings2, LogOut, Menu, Eye, EyeOff, X } from 'lucide-react';
import type { AdminSession } from '../../../shared/types';
import { api, isAbort, jsonBody, messageOf, RequestError, setCsrf } from '../api';
import { useApp } from '../context';
import { ErrorNotice, IconButton, Loading } from '../components/UI';
import { Dashboard, ArtifactList } from './ContentPages';
import { ArtifactEditor } from './ArtifactEditor';
import { ImportPage, MediaPage, SettingsPage } from './ManagementPages';
import '../styles/admin.css';

interface AdminContextValue { session: AdminSession; dirty: boolean; setDirty: (dirty: boolean) => void; logout: () => Promise<void>; signedOut: () => void }
const AdminContext = createContext<AdminContextValue>(null!);
export const useAdmin = () => useContext(AdminContext);

function Login({ onLogin }: { onLogin: (session: AdminSession) => void }) {
  const { config } = useApp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { const session = await api<AdminSession>('/admin/login', { method: 'POST', body: jsonBody({ username, password }) }); setCsrf(session.csrfToken); onLogin(session); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <div className="login-page"><div className="login-art"><Link to="/" className="admin-brand"><Asterisk className="ico" />{config.shortName}<span>CAMPUS WIKI</span></Link><div><span className="mono">THE STORIES WE KEEP</span><h1>让校园记忆，<br />有迹可循。</h1><p>{config.description}</p></div><span className="login-art-letter" aria-hidden="true">志</span><p className="login-art-foot">{config.tagline}</p></div>
    <div className="login-panel"><Link to="/" className="back-to-site">回到 {config.shortName}<ArrowUpRight className="ico" /></Link><form className="login-form" onSubmit={submit}><span className="eyebrow">EDITOR'S DESK</span><h2>欢迎回到编辑室</h2><p>使用管理员账号，整理、编辑和发布校园条目。</p>{error && <ErrorNotice message={error} />}<label>用户名<input name="username" autoComplete="username" required maxLength={100} value={username} onChange={event => setUsername(event.target.value)} /></label><label>密码<div className="password-input"><input name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /><IconButton icon={visible ? EyeOff : Eye} label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(value => !value)} /></div></label><button type="submit" className="admin-primary" disabled={busy}>{busy ? '正在登录…' : '进入内容管理'}<ArrowUpRight className="ico" /></button><p className="login-help">账号由站点管理员创建。如忘记密码，请联系站点维护者。</p></form><span className="login-copyright">{config.siteName} · 内容管理</span></div>
  </div>;
}
export default function AdminApp() {
  const { config, toast } = useApp();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useLayoutEffect(() => { document.body.dataset.theme = 'admin'; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true); setError('');
    api<AdminSession>('/admin/session', { signal: controller.signal }).then(value => { setCsrf(value.csrfToken); setSession(value); }).catch(failure => {
      if (isAbort(failure)) return;
      if (!(failure instanceof RequestError && failure.status === 401)) setError(messageOf(failure));
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const expired = () => { setSession(null); setCsrf(''); setDirty(false); toast('登录已过期，请重新登录。'); };
    window.addEventListener('wiki:session-expired', expired);
    return () => window.removeEventListener('wiki:session-expired', expired);
  }, [toast]);
  useEffect(() => { setMenu(false); }, [location.pathname]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  async function logout() {
    if (dirty && !window.confirm('有尚未保存的修改，确定退出吗？')) return;
    try { await api('/admin/logout', { method: 'POST' }); setSession(null); setCsrf(''); setDirty(false); }
    catch (failure) { toast(messageOf(failure)); }
  }
  const guard = (event: React.MouseEvent) => { if (dirty && !window.confirm('有尚未保存的修改，确定离开编辑器吗？')) event.preventDefault(); };
  if (checking) return <Loading text="正在打开编辑室…" />;
  if (error) return <div className="admin-start-error"><ErrorNotice message={error} retry={() => setRetry(n => n + 1)} /></div>;
  if (!session) return <Login onLogin={setSession} />;
  const links = [{ path: '/admin', label: '总览', icon: LayoutDashboard, end: true }, { path: '/admin/artifacts', label: '条目管理', icon: Files }, { path: '/admin/import', label: '批量导入', icon: Upload }, { path: '/admin/media', label: '媒体资料', icon: Images }, { path: '/admin/settings', label: '站点与账号', icon: Settings2 }];
  return <AdminContext value={{ session, dirty, setDirty, logout, signedOut: () => { setSession(null); setCsrf(''); setDirty(false); } }}><div className="admin-shell">
    <header className="admin-mobile-header"><Link to="/admin" onClick={guard}>{config.shortName}<span>编辑室</span></Link><IconButton icon={menu ? X : Menu} label={menu ? '关闭导航' : '打开导航'} onClick={() => setMenu(value => !value)} aria-expanded={menu} /></header>
    {menu && <button className="admin-menu-backdrop" aria-label="关闭导航" onClick={() => setMenu(false)} />}
    <aside className={`admin-sidebar ${menu ? 'is-open' : ''}`}><Link to="/" onClick={guard} className="admin-brand"><Asterisk className="ico" /><strong>{config.shortName}</strong></Link><div className="admin-sidebar-label">CONTENT STUDIO</div><nav aria-label="管理导航">{links.map(link => <NavLink key={link.path} to={link.path} end={link.end} onClick={guard}><link.icon className="ico" />{link.label}</NavLink>)}</nav><div className="admin-sidebar-foot"><Link to="/" onClick={guard}>查看网站<ArrowUpRight className="ico" /></Link><div className="admin-user"><span className="admin-avatar">{session.username.slice(0, 1).toUpperCase()}</span><span><strong>{session.username}</strong><small>管理员</small></span><IconButton icon={LogOut} label="退出登录" onClick={() => { void logout(); }} /></div></div></aside>
    <main className="admin-main"><Routes><Route index element={<Dashboard />} /><Route path="artifacts" element={<ArtifactList />} /><Route path="artifacts/new" element={<ArtifactEditor key="new" />} /><Route path="artifacts/:id" element={<ArtifactEditor />} /><Route path="import" element={<ImportPage />} /><Route path="media" element={<MediaPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<div className="admin-not-found"><h1>这个页面不存在</h1><Link to="/admin">返回管理总览</Link></div>} /></Routes></main>
  </div></AdminContext>;
}
