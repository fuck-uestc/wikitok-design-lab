import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, FileJson, FileText, X, Check, ArrowUpRight, Upload, Copy, KeyRound, Images, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ImportPolicy, ImportPreview, Media, SiteConfig } from '../../../shared/types';
import { api, jsonBody, mediaUrl, messageOf } from '../api';
import { useApp } from '../context';
import { useAdmin } from './AdminApp';
import { useResource } from '../hooks/useResource';
import { ErrorNotice, IconButton, Loading } from '../components/UI';
import { PageHeading } from './ContentPages';

interface AdminSettings { site: SiteConfig; limits: { uploadMb: number; importMb: number; importMaxRecords: number; maxFiles: number } }
const actionLabels = { create: '新增', update: '更新', skip: '跳过', error: '错误' };
export function ImportPage() {
  const { toast } = useApp();
  const settings = useResource<AdminSettings>('/admin/settings');
  const [files, setFiles] = useState<File[]>([]);
  const [policy, setPolicy] = useState<ImportPolicy>('skip');
  const [defaultStatus, setDefaultStatus] = useState<'draft' | 'published'>('draft');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function choose(selected: File[]) {
    setError(''); setDone(false); setPreview(null);
    if (selected.length > 20) { setError('每次最多选择 20 个文件。'); return; }
    setFiles(selected);
  }
  async function validate() {
    if (!files.length || busy) return;
    setBusy(true); setError(''); setPreview(null); setDone(false);
    const body = new FormData(); files.forEach(file => body.append('files', file)); body.append('policy', policy); body.append('defaultStatus', defaultStatus);
    try { setPreview(await api<ImportPreview>('/admin/imports/preview', { method: 'POST', body })); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview?.canCommit || committing || done) return;
    setCommitting(true); setError('');
    try { await api(`/admin/imports/${preview.id}/commit`, { method: 'POST' }); setDone(true); toast(`导入完成：新增 ${preview.counts.create} 条，更新 ${preview.counts.update} 条。`); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setCommitting(false); }
  }
  return <><PageHeading eyebrow="BATCH IMPORT" title="让散落的资料，找到归处。" description="先上传并校验，确认预览后再写入数据库。一次整理，一起入册。" />
    <div className="import-grid"><section className="admin-panel import-main"><div className="import-steps"><span className="active"><b>1</b>选择资料</span><i /><span className={preview ? 'active' : ''}><b>2</b>校验预览</span><i /><span className={done ? 'active' : ''}><b>3</b>完成导入</span></div>
      <input ref={input} type="file" accept=".json,.csv,.md,.markdown" multiple hidden onChange={event => { choose(Array.from(event.target.files || [])); event.target.value = ''; }} />
      <button type="button" className={`import-dropzone ${dragging ? 'dragging' : ''}`} disabled={busy || committing} onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy && !committing) choose(Array.from(event.dataTransfer.files)); }}><UploadCloud className="ico" /><strong>拖放文件到这里，或点击选择</strong><span>JSON · CSV · Markdown</span><small>{settings.data ? `最多 20 个文件，每个 ${settings.data.limits.importMb} MB，每批 ${settings.data.limits.importMaxRecords} 条` : '支持 UTF-8 编码的文件'}</small></button>
      {files.length > 0 && <div className="selected-files">{files.map((file, index) => <div key={`${file.name}-${index}`}><FileText className="ico" /><span>{file.name}<small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span><IconButton icon={X} label={`移除 ${file.name}`} disabled={busy || committing} onClick={() => choose(files.filter((_, i) => i !== index))} /></div>)}</div>}
      <div className="form-grid import-options"><label>遇到已存在的条目<select value={policy} disabled={busy || committing} onChange={event => { setPolicy(event.target.value as ImportPolicy); setPreview(null); setDone(false); }}><option value="skip">跳过，不修改原条目</option><option value="update">更新，完整替换原条目</option><option value="error">报告错误，停止导入</option></select></label><label>未指定状态时<select value={defaultStatus} disabled={busy || committing} onChange={event => { setDefaultStatus(event.target.value as 'draft' | 'published'); setPreview(null); setDone(false); }}><option value="draft">保存为草稿</option><option value="published">直接发布</option></select></label></div>
      <p className="field-hint">以 slug 或 externalId 识别重复条目。文件中明确填写的 status 优先于缺省状态。{policy === 'update' && ' 更新会替换正文、标签、附件关联和发布状态，缺省字段也会覆盖原值。'}</p>
      <button type="button" className="admin-primary" disabled={!files.length || busy || committing} onClick={() => { void validate(); }}><FileJson className="ico" />{busy ? '正在校验…' : '校验并生成预览'}</button>
    </section><aside className="import-help"><section className="admin-panel"><span className="eyebrow">START WITH A TEMPLATE</span><h2>从一份模板开始</h2><p>下载模板，替换示例内容，再上传到这里。</p><a href="/templates/artifacts.json" download><FileJson className="ico" /><span>JSON 模板<small>适合程序导出、完整字段</small></span><ArrowUpRight className="ico" /></a><a href="/templates/artifacts.csv" download><FileText className="ico" /><span>CSV 模板<small>适合表格整理、批量条目</small></span><ArrowUpRight className="ico" /></a><a href="/templates/artifact.md" download><FileText className="ico" /><span>Markdown 模板<small>一份文件对应一个条目</small></span><ArrowUpRight className="ico" /></a></section><section className="editor-note"><h3>资料入册之前</h3><p>每条记录需要标题与正文。其他字段可选；图片先上传到媒体库，再填写文件 ID 或图片外链。</p><p>预览有效期为 30 分钟。任何校验错误都会阻止整批提交，修正后重新预览即可。</p></section></aside></div>
    {error && <ErrorNotice message={error} />}
    {preview && <section className="admin-panel import-preview"><div className="panel-heading"><h2>{done ? '这一批资料，已整理入册。' : '核对这一次的整理结果。'}</h2>{done && <span className="status-badge published"><Check className="ico" />已完成</span>}</div><div className="import-counts">{Object.entries(preview.counts).map(([action, count]) => <div key={action} className={`import-count ${action}`}><strong>{count}</strong><span>{actionLabels[action as keyof typeof actionLabels]}</span></div>)}</div>
      <div className="admin-table-scroll import-result-table"><table className="admin-table"><thead><tr><th>文件 / 记录</th><th>条目标题</th><th>状态</th><th>处理结果</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}><td className="import-file-cell">{row.file}<small>{row.row ? `第 ${row.row} 条记录` : '文件解析'}</small></td><td>{row.title || '—'}</td><td>{row.status ? row.status === 'published' ? '发布' : row.status === 'archived' ? '归档' : '草稿' : '—'}</td><td><span className={`import-action ${row.action}`}>{actionLabels[row.action]}</span>{row.errors.map((issue, i) => <p className="import-row-error" key={i}>{issue}</p>)}</td></tr>)}</tbody></table></div>
      <div className="import-commit"><p>{done ? '可在条目管理中继续编辑、核对或发布。' : preview.counts.error ? '请修正所有错误后重新预览。当前尚未写入任何条目。' : !preview.canCommit ? '没有需要写入的内容；全部重复条目将保留原样。' : `确认后将新增 ${preview.counts.create} 条、更新 ${preview.counts.update} 条。`}</p>{done ? <Link to="/admin/artifacts" className="admin-primary">查看条目<ArrowUpRight className="ico" /></Link> : <button className="admin-primary" disabled={!preview.canCommit || committing} onClick={() => { void commit(); }}><Check className="ico" />{committing ? '正在导入…' : `确认导入 ${preview.counts.create + preview.counts.update} 条`}</button>}</div>
    </section>}
  </>;
}

export function MediaPage() {
  const { toast } = useApp();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const resource = useResource<{ items: Media[]; total: number }>(`/admin/media?page=${page}`);
  const settings = useResource<AdminSettings>('/admin/settings');
  async function upload(files: File[]) {
    if (!files.length || busy) return;
    if (files.length > 20) { setError('每次最多上传 20 个文件。'); return; }
    setBusy(true); setError('');
    const body = new FormData(); files.forEach(file => body.append('files', file));
    try { const result = await api<{ items: Media[] }>('/admin/media', { method: 'POST', body }); setPage(1); resource.reload(); toast(`已上传 ${result.items.length} 个文件，相同文件自动复用。`); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="MEDIA LIBRARY" title="图片和资料，各得其所。" description={`上传封面与附件，在不同条目间复用。支持 PNG、JPEG、GIF、WebP、PDF、TXT${settings.data ? `，单文件最多 ${settings.data.limits.uploadMb} MB` : ''}。`}><button className="admin-primary" disabled={busy} onClick={() => input.current?.click()}><Upload className="ico" />{busy ? '上传中…' : '上传资料'}</button></PageHeading><input ref={input} hidden type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt" onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }} />
    {error && <ErrorNotice message={error} />}{resource.error && <ErrorNotice message={resource.error} retry={resource.reload} />}
    {resource.loading ? <Loading /> : resource.data && <>{resource.data.items.length ? <div className="media-grid">{resource.data.items.map(file => <article className="media-card" key={file.id}><a href={mediaUrl(file.url)} target="_blank" rel="noopener noreferrer" className="media-card-preview" aria-label={`查看 ${file.originalName}`}>{file.mimeType.startsWith('image/') ? <img src={mediaUrl(file.url)} alt={file.originalName} loading="lazy" /> : <FileText className="ico" />}</a><div className="media-card-body"><strong>{file.originalName}</strong><small>{file.mimeType} · {Math.max(1, Math.round(file.size / 1024))} KB</small><div className="media-id"><code>{file.id}</code><IconButton icon={Copy} label={`复制文件 ID：${file.originalName}`} onClick={async () => { try { await navigator.clipboard.writeText(file.id); toast('文件 ID 已复制，可用于批量导入。'); } catch { toast('请手动选择并复制卡片下方的文件 ID。'); } }} /></div></div></article>)}</div> : <section className="admin-panel admin-empty"><Images className="ico" /><h3>给记忆添一张图片</h3><p>上传资料后，可在编辑器选择封面或关联附件。</p><button className="secondary-button" onClick={() => input.current?.click()}>上传第一份资料</button></section>}
      <div className="table-pagination"><span>共 {resource.data.total} 个文件 · 第 {page} 页</span><div><IconButton icon={ChevronLeft} label="上一页" disabled={page === 1} onClick={() => setPage(n => n - 1)} /><IconButton icon={ChevronRight} label="下一页" disabled={page * 50 >= resource.data.total} onClick={() => setPage(n => n + 1)} /></div></div><p className="field-hint">未被已发布条目引用的文件，仅管理员可访问。媒体 ID 供导入使用；正式迁移时请同时备份数据库与上传目录。</p>
    </>}
  </>;
}

interface AuditItem { actor: string; action: string; targetId: string; detail: string; createdAt: string }
export function SettingsPage() {
  const { toast } = useApp();
  const { session, signedOut } = useAdmin();
  const settings = useResource<AdminSettings>('/admin/settings');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  const audit = useResource<AuditItem[]>(showAudit ? '/admin/audit' : null);
  async function changePassword(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (newPassword !== confirmPassword) { setError('两次输入的新密码不一致。'); return; }
    if (newPassword.length < 12) { setError('新密码至少需要 12 个字符。'); return; }
    setBusy(true); setError('');
    try { await api('/admin/password', { method: 'POST', body: jsonBody({ currentPassword, newPassword }) }); signedOut(); toast('密码已修改，请使用新密码重新登录。'); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="SITE & ACCOUNT" title="照看好这间校园编辑室。" description="查看当前站点配置，管理管理员密码与操作记录。" />
    <div className="settings-grid"><section className="admin-panel settings-section"><h2>当前站点</h2><p className="section-description">站点名称、地址等由部署环境的 .env 管理；修改后重启服务生效。详细配置见 docs/CONFIGURATION.md。</p>{settings.loading ? <Loading /> : settings.error ? <ErrorNotice message={settings.error} retry={settings.reload} /> : settings.data && <dl className="settings-list">{[['网站名称', settings.data.site.siteName], ['品牌短名', settings.data.site.shortName], ['网站地址', settings.data.site.siteUrl], ['后端地址', settings.data.site.apiBaseUrl], ['默认主题', settings.data.site.defaultTheme === 'margin' ? '页外 MARGIN' : '游离 DRIFT'], ['BBS 地址', settings.data.site.bbsBaseUrl || '未配置'], ['联系邮箱', settings.data.site.contactEmail || '未配置'], ['导入上限', `${settings.data.limits.importMaxRecords} 条 / 批次`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</section>
      <form className="admin-panel settings-section password-form" onSubmit={changePassword}><KeyRound className="ico" /><h2>修改管理员密码</h2><p className="section-description">当前账号：{session.username}。修改后会退出所有已登录会话。</p><input className="sr-only" name="username" autoComplete="username" value={session.username} readOnly tabIndex={-1} aria-hidden="true" /><label>当前密码<input type="password" autoComplete="current-password" required maxLength={256} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label>新密码<input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="至少 12 个字符" /></label><label>再次输入新密码<input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>{error && <ErrorNotice message={error} />}<button className="admin-primary" disabled={busy}>{busy ? '正在修改…' : '更新密码'}</button></form>
    </div><section className="admin-panel audit-panel"><div className="panel-heading"><div><h2>编辑记录</h2><p className="section-description">保留新增、修改、发布、导入与账号操作的记录。</p></div><button className="secondary-button" onClick={() => setShowAudit(value => !value)}>{showAudit ? '收起记录' : '查看最近记录'}</button></div>{showAudit && (audit.loading ? <Loading /> : audit.error ? <ErrorNotice message={audit.error} retry={audit.reload} /> : <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>目标</th></tr></thead><tbody>{audit.data?.map((row, index) => <tr key={index}><td>{new Date(row.createdAt).toLocaleString('zh-CN')}</td><td>{row.actor}</td><td>{row.action}</td><td><code>{row.targetId || '—'}</code></td></tr>)}</tbody></table></div>)}</section>
  </>;
}
