import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Upload, ArrowUpRight, Search, Pencil, Archive, Download, ChevronLeft, ChevronRight, Files, Check, FilePenLine, Images } from 'lucide-react';
import type { ArtifactSummary, Stats } from '../../../shared/types';
import { kindLabels, statusLabels } from '../../../shared/types';
import { api, apiUrl, jsonBody, messageOf } from '../api';
import { useApp } from '../context';
import { useResource } from '../hooks/useResource';
import { Dialog, ErrorNotice, formatDate, IconButton, Loading } from '../components/UI';
import { ArtifactImage } from '../components/ArticleCards';

export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <header className="admin-page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="admin-heading-actions">{children}</div></header>;
}
export function Dashboard() {
  const { config } = useApp();
  const resource = useResource<Stats>('/admin/stats');
  return <><PageHeading eyebrow="OVERVIEW" title="让记忆，慢慢长成一本书。" description={`${config.siteName}的内容工作台。每一次整理，都让校园故事更容易被找到。`}><Link to="/admin/artifacts/new" className="admin-primary"><Plus className="ico" />新建条目</Link></PageHeading>
    {resource.error && <ErrorNotice message={resource.error} retry={resource.reload} />}{resource.loading ? <Loading /> : resource.data && <>
      <div className="stat-grid">{[{ label: '已发布条目', value: resource.data.published, icon: Check }, { label: '待整理草稿', value: resource.data.draft, icon: FilePenLine }, { label: '归档条目', value: resource.data.archived, icon: Archive }, { label: '媒体资料', value: resource.data.media, icon: Images }].map(stat => <div className="stat-card" key={stat.label}><span>{stat.label}<stat.icon className="ico" /></span><strong>{String(stat.value).padStart(2, '0')}</strong><span className="stat-foot">{stat.label === '已发布条目' ? '公开可访问，投放由设置决定' : stat.label === '待整理草稿' ? '仅管理员可以阅读' : stat.label === '归档条目' ? '保留历史，可随时恢复' : '封面、图片与附件'}</span></div>)}</div>
      <div className="dashboard-grid"><section className="admin-panel recent-panel"><div className="panel-heading"><h2>最近整理</h2><Link to="/admin/artifacts">全部条目<ArrowUpRight className="ico" /></Link></div>{resource.data.recent.length ? resource.data.recent.map(a => <Link to={`/admin/artifacts/${a.id}`} key={a.id} className="recent-entry"><ArtifactImage artifact={a} className="admin-thumb" /><span><strong>{a.title}</strong><small>{a.category || kindLabels[a.kind]} · {formatDate(a.updatedAt)}</small></span><span className={`status-badge ${a.status}`}>{statusLabels[a.status]}</span><ArrowUpRight className="ico" /></Link>) : <div className="admin-empty"><Files className="ico" /><h3>这里还没有条目</h3><p>写下第一段故事，或导入已经整理好的资料。</p><Link to="/admin/artifacts/new" className="secondary-button">添加第一条记忆<Plus className="ico" /></Link></div>}</section>
      <aside className="dashboard-aside"><section className="import-promo"><Upload className="ico" /><span className="eyebrow">BRING YOUR ARCHIVE</span><h2>把散落的资料，<br />收进同一个地方。</h2><p>上传 JSON、CSV 或多个 Markdown 文件，校验后一次导入。原帖出处和标签，一并保留。</p><Link to="/admin/import">开始批量导入<ArrowUpRight className="ico" /></Link></section><section className="editor-note"><span className="mono">A NOTE FOR THE EDITOR</span><p>好的 Wiki，让记忆有出处。发布前，补上原帖链接、作者与图片署名。</p></section></aside></div>
    </>}
  </>;
}
interface AdminPage { items: ArtifactSummary[]; total: number; page: number; pages: number }
export function ArtifactList() {
  const { toast } = useApp();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState('');
  const [page, setPage] = useState(1);
  const [archive, setArchive] = useState<ArtifactSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setDebounced(query); setPage(1); }, 250); return () => clearTimeout(timer); }, [query]);
  const resource = useResource<AdminPage>(`/admin/artifacts?${new URLSearchParams({ q: debounced, status, ...(format?{format}:{}), page: String(page) })}`);
  async function archiveSelected() {
    if (!archive || busy) return;
    setBusy(true); setError('');
    try { await api(`/admin/artifacts/${archive.id}`, { method: 'DELETE', body: jsonBody({ version: archive.version }) }); setArchive(null); resource.reload(); toast('条目已归档，可在归档列表中恢复。'); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="ARTIFACTS" title="整理校园里的每一段记忆。" description="管理条目、完善出处，决定哪些内容与大家见面。"><a className="secondary-button" href={apiUrl('/admin/export')}><Download className="ico" />导出</a><Link to="/admin/artifacts/new" className="admin-primary"><Plus className="ico" />新建条目</Link></PageHeading>
    <section className="admin-panel"><div className="content-toolbar"><div className="admin-tabs" role="group" aria-label="筛选条目状态">{[['', '全部条目'], ['published', '已发布'], ['draft', '草稿'], ['archived', '已归档']].map(([value, label]) => <button key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }}>{label}</button>)}</div><select aria-label="内容形式" value={format} onChange={e=>{setFormat(e.target.value);setPage(1);}}><option value="">长文与切片</option><option value="long">长文</option><option value="short">切片</option></select><label className="admin-search"><Search className="ico" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索条目、作者或标签" maxLength={100} aria-label="搜索管理条目" /></label></div>
      {resource.loading ? <Loading /> : resource.error ? <ErrorNotice message={resource.error} retry={resource.reload} /> : resource.data && <>
        {resource.data.items.length ? <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>条目</th><th>分类</th><th>状态</th><th>最后更新</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{resource.data.items.map(a => <tr key={a.id}><td><Link className="table-title" to={`/admin/artifacts/${a.id}`}><ArtifactImage artifact={a} className="admin-thumb" /><span><strong>{a.title}</strong><small>{a.format==='short'?'切片':'长文'} · {a.feedIds.length?a.feedIds.join(' / '):'不投放'} · {a.author ? `@${a.author}` : kindLabels[a.kind]} · 第 {a.version} 版</small></span></Link></td><td><span className="category-label">{a.category || '未分类'}</span></td><td><span className={`status-badge ${a.status}`}>{statusLabels[a.status]}</span></td><td className="table-date">{formatDate(a.updatedAt)}</td><td><div className="table-actions"><Link to={`/admin/artifacts/${a.id}`} aria-label={`编辑：${a.title}`} className="icon-btn"><Pencil className="ico" /></Link>{a.status !== 'archived' && <IconButton icon={Archive} label={`归档：${a.title}`} onClick={() => { setError(''); setArchive(a); }} />}</div></td></tr>)}</tbody></table></div> : <div className="admin-empty"><Files className="ico" /><h3>{query ? '没有找到符合条件的条目' : '这里还没有条目'}</h3><p>{query ? '试试其他关键词。' : '从一条故事开始，或批量导入资料。'}</p></div>}
        <div className="table-pagination"><span>共 {resource.data.total} 条 · 第 {page} / {Math.max(1, resource.data.pages)} 页</span><div><IconButton icon={ChevronLeft} label="上一页" disabled={page === 1} onClick={() => setPage(value => value - 1)} /><IconButton icon={ChevronRight} label="下一页" disabled={page >= resource.data.pages} onClick={() => setPage(value => value + 1)} /></div></div>
      </>}
    </section>{archive && <Dialog title="归档这条记忆？" onClose={() => { if (!busy) setArchive(null); }}><div className="confirmation-body"><h3>{archive.title}</h3><p>归档后将从公开网站下架。正文、附件和历史版本会保留，可以再次编辑发布。</p>{error && <ErrorNotice message={error} />}<div className="confirmation-actions"><button className="secondary-button" disabled={busy} onClick={() => setArchive(null)}>取消</button><button className="admin-primary" disabled={busy} onClick={() => { void archiveSelected(); }}>{busy ? '正在归档…' : '确认归档'}</button></div></div></Dialog>}
  </>;
}
