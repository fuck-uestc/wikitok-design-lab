import { ShortText } from '../components/ShortCard';
import { ShortFields, blankShort } from './ShortFields';
import { defaultFeedIds } from '../../../shared/feeds';
import type { FeedSettings } from '../../../shared/types';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send, Eye, Pencil, Upload, ImagePlus, X, History, FileText, Images } from 'lucide-react';
import type { Artifact, ArtifactInput, ArtifactStatus, Media, Revision } from '../../../shared/types';
import { kindLabels, statusLabels } from '../../../shared/types';
import { artifactSchema, slugify } from '../../../shared/schema';
import { api, coverUrl, isAbort, jsonBody, mediaUrl, messageOf } from '../api';
import { useApp } from '../context';
import { useAdmin } from './AdminApp';
import { useResource } from '../hooks/useResource';
import { Dialog, ErrorNotice, formatDate, IconButton, Loading, Markdown } from '../components/UI';

const blank: ArtifactInput = { format: 'long', feedIds: ['main','wiki'], short: null, title: '', slug: '', summary: '', content: '', kind: 'article', category: '', tags: [], aliases: [], author: '', sourceUrl: '', sourceTitle: '', sourceThreadId: '', externalId: '', coverUrl: '', coverMediaId: '', coverAlt: '', coverCredit: '', eventDate: '', status: 'draft', attachmentIds: [] };
const terms = (value: string) => [...new Set(value.split(/[,，|]/).map(v => v.trim()).filter(Boolean))];
function inputOf(a: Artifact): ArtifactInput {
  const { id: _id, version: _version, createdAt: _created, updatedAt: _updated, publishedAt: _published, attachments: _attachments, ...input } = a;
  return input;
}
interface CachedDraft { form: ArtifactInput; tagText: string; aliasText: string; version: number }
function MediaPicker({ imageOnly, onSelect, onClose }: { imageOnly: boolean; onSelect: (media: Media) => void; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const media = useResource<{ items: Media[]; total: number }>(`/admin/media?page=${page}`);
  const items = media.data?.items.filter(file => !imageOnly || file.mimeType.startsWith('image/')) || [];
  return <Dialog title={imageOnly ? '从媒体库选择封面' : '从媒体库选择附件'} onClose={onClose}><div className="media-picker">{media.loading ? <Loading /> : media.error ? <ErrorNotice message={media.error} retry={media.reload} /> : <><div className="media-picker-grid">{items.map(file => <button key={file.id} onClick={() => onSelect(file)}>{file.mimeType.startsWith('image/') ? <img src={mediaUrl(file.url)} alt={file.originalName} /> : <FileText className="ico" />}<span>{file.originalName}</span></button>)}</div>{!items.length && <p>这一页还没有可用{imageOnly ? '图片' : '文件'}。</p>}<div className="picker-pagination"><button className="secondary-button" disabled={page === 1} onClick={() => setPage(n => n - 1)}>上一页</button><span>{page}</span><button className="secondary-button" disabled={page * 50 >= (media.data?.total || 0)} onClick={() => setPage(n => n + 1)}>下一页</button></div></>}</div></Dialog>;
}
function RevisionDialog({ id, currentVersion, onClose, onRestore }: { id: string; currentVersion: number; onClose: () => void; onRestore: (artifact: Artifact) => void }) {
  const revisions = useResource<Revision[]>(`/admin/artifacts/${id}/revisions`);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function restore() {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { const restored = await api<Artifact>(`/admin/artifacts/${id}/restore`, { method: 'POST', body: jsonBody({ version: currentVersion, revision: selected.version }) }); onRestore(restored); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog title="历史版本" onClose={() => { if (!busy) onClose(); }} className="revision-dialog"><div className="revision-body">{revisions.loading ? <Loading /> : revisions.error ? <ErrorNotice message={revisions.error} retry={revisions.reload} /> : <><p className="field-hint">恢复会生成一个新版本，并恢复该版本的正文、附件及发布状态。</p><div className="revision-list">{revisions.data?.map(revision => <button key={revision.id} aria-pressed={selected?.id === revision.id} onClick={() => setSelected(revision)}><strong>第 {revision.version} 版</strong><span>{revision.actor} · {formatDate(revision.createdAt)}</span><span className={`status-badge ${revision.snapshot.status}`}>{statusLabels[revision.snapshot.status]}</span></button>)}</div>{selected && <section className="revision-preview"><h3>{selected.snapshot.title}</h3><p className="field-hint">{selected.snapshot.feedIds?.join(', ') || 'No feed'}</p>{selected.snapshot.short && <ShortText short={selected.snapshot.short} />}<Markdown content={selected.snapshot.content} /><button className="admin-primary" disabled={busy || selected.version === currentVersion} onClick={() => { void restore(); }}>{busy ? '正在恢复…' : `恢复第 ${selected.version} 版`}</button></section>}</>}{error && <ErrorNotice message={error} />}</div></Dialog>;
}

export function ArtifactEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { config, toast } = useApp();
  const { dirty, setDirty } = useAdmin();
  const feedSettings = useResource<FeedSettings>('/admin/feeds');
  const [form, setForm] = useState<ArtifactInput>({ ...blank });
  const [version, setVersion] = useState(0);
  const [tagText, setTagText] = useState('');
  const [aliasText, setAliasText] = useState('');
  const [attachments, setAttachments] = useState<Media[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState(false);
  const [picker, setPicker] = useState<'cover' | 'attachment' | null>(null);
  const [reload, setReload] = useState(0);
  const [recoverable, setRecoverable] = useState<CachedDraft | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const draftKey = `campus-wiki:editing:${id || 'new'}`;
  function apply(a: Artifact) { setForm(inputOf(a)); setVersion(a.version); setTagText(a.tags.join(', ')); setAliasText(a.aliases.join(', ')); setAttachments(a.attachments); setDirty(false); }
  function restoreCache(cached: CachedDraft) { setForm({ ...blank, ...cached.form, feedIds: cached.form.feedIds ?? defaultFeedIds(cached.form.format || 'long') }); setTagText(cached.tagText); setAliasText(cached.aliasText); setDirty(true); }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(!!id); setLoadError(''); setError(''); setRecoverable(null); setDirty(false);
    const recover = (serverVersion: number) => {
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (!raw) return;
        const cached: CachedDraft = JSON.parse(raw);
        if (!cached.form || typeof cached.form.title !== 'string' || typeof cached.form.content !== 'string') return;
        if (cached.version === serverVersion) { restoreCache(cached); toast('已恢复此标签页中的未保存编辑。'); }
        else setRecoverable(cached);
      } catch { /* Unavailable session storage must not block editing. */ }
    };
    if (id) api<Artifact>(`/admin/artifacts/${id}`, { signal: controller.signal }).then(a => { apply(a); recover(a.version); }).catch(failure => { if (!isAbort(failure)) setLoadError(messageOf(failure)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    else { setForm({ ...blank }); setVersion(0); setTagText(''); setAliasText(''); setAttachments([]); recover(0); }
    return () => { controller.abort(); setDirty(false); };
  }, [id, reload]);
  useEffect(() => {
    if (!dirty || loading) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ form, tagText, aliasText, version } satisfies CachedDraft)); } catch { /* Saving on the server remains available. */ }
  }, [form, tagText, aliasText, dirty, loading, draftKey, version]);
  function update<K extends keyof ArtifactInput>(key: K, value: ArtifactInput[K]) { setForm(current => ({ ...current, [key]: value })); setDirty(true); }
  async function save(status: ArtifactStatus) {
    if (saving || uploading) return;
    setError('');
    const parsed = artifactSchema.safeParse({ ...form, tags: terms(tagText), aliases: terms(aliasText), status });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；')); return; }
    setSaving(true);
    try {
      const result = await api<Artifact>(id ? `/admin/artifacts/${id}` : '/admin/artifacts', { method: id ? 'PUT' : 'POST', body: jsonBody({ ...parsed.data, ...(id ? { version } : {}) }) });
      try { sessionStorage.removeItem(draftKey); } catch { /* Optional draft cache. */ }
      apply(result); setRecoverable(null);
      toast(status === 'published' ? '条目已保存并发布。' : '草稿已保存。');
      if (!id) navigate(`/admin/artifacts/${result.id}`, { replace: true });
    } catch (failure) { setError(messageOf(failure)); }
    finally { setSaving(false); }
  }
  function selectMedia(file: Media, mode: 'cover' | 'attachment') {
    if (mode === 'cover') { setForm(current => ({ ...current, coverMediaId: file.id, coverUrl: '' })); setDirty(true); }
    else { setAttachments(current => current.some(m => m.id === file.id) ? current : [...current, file]); setForm(current => ({ ...current, attachmentIds: [...new Set([...current.attachmentIds, file.id])] })); setDirty(true); }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>, mode: 'cover' | 'attachment') {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (!files.length) return;
    if (mode === 'attachment' && form.attachmentIds.length + files.length > 20) { setError('每条内容最多添加 20 个附件。'); return; }
    setUploading(true); setError('');
    const body = new FormData(); files.forEach(file => body.append('files', file));
    try { const result = await api<{ items: Media[] }>('/admin/media', { method: 'POST', body }); result.items.forEach(file => selectMedia(file, mode)); toast('文件已上传，保存条目后关联生效。'); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setUploading(false); }
  }
  function cancel(event: React.MouseEvent) { if (dirty && !window.confirm('有尚未保存的修改，确定返回列表吗？')) event.preventDefault(); }
  function submit(event: FormEvent) { event.preventDefault(); void save(form.status); }
  if (loading) return <Loading text="正在打开条目…" />;
  if (loadError) return <ErrorNotice message={loadError} retry={() => setReload(n => n + 1)} />;
  return <form className="artifact-editor" onSubmit={submit} noValidate>
    <header className="editor-heading"><div><Link to="/admin/artifacts" onClick={cancel} className="editor-back"><ArrowLeft className="ico" />条目管理</Link><h1>{id ? '把这一段记忆，写得更完整。' : '写下新的一段校园记忆。'}</h1><div className="editor-save-state"><span className={`status-badge ${form.status}`}>{statusLabels[form.status]}</span><span>{dirty ? '有未保存的修改' : id ? `已保存 · 第 ${version} 版` : '尚未保存'}</span></div></div><div className="editor-heading-actions">{id && <button type="button" className="secondary-button" onClick={() => {
      if (dirty && !window.confirm('有未保存的修改。恢复历史版本会替换这些修改，仍要查看历史吗？')) return;
      setHistory(true);
    }}><History className="ico" />历史版本</button>}{id && form.status === 'published' && <Link to={`/a/${encodeURIComponent(form.slug)}`} target="_blank" className="secondary-button"><Eye className="ico" />查看公开页</Link>}</div></header>
    {error && <ErrorNotice message={error} />}
    {recoverable && <div className="recovery-notice"><p>服务器版本已更新，此标签页还有一份未保存编辑。载入后请核对最新内容再保存。</p><button type="button" className="secondary-button" onClick={() => { restoreCache(recoverable); setRecoverable(null); }}>载入未保存编辑</button><button type="button" onClick={() => { setRecoverable(null); try { sessionStorage.removeItem(draftKey); } catch { /* Optional. */ } }}>忽略</button></div>}
    <fieldset disabled={saving} className="editor-fields"><div className="editor-columns"><div className="editor-main-column">
      <section className="admin-panel editor-section"><label>内容形式<select name="format" value={form.format} onChange={e=>{
        const format=e.target.value as ArtifactInput['format'];
        const defaults=defaultFeedIds(form.format);const untouched=form.feedIds.length===defaults.length&&defaults.every(id=>form.feedIds.includes(id));
        setForm(v=>({...v,format,short:format==='short'?(v.short||blankShort()):v.short,feedIds:untouched?defaultFeedIds(format):v.feedIds}));setDirty(true);
      }}><option value="long">长文：完整事件与资料</option><option value="short">切片：原话、原图、对照与小事</option></select></label>
        <label className="title-field">{form.format==='short'?'索引与分享标题':'条目标题'} <span>*</span><input name="title" maxLength={200} value={form.title} onChange={e=>update('title',e.target.value)}/></label>
        {form.format==='short'&&<ShortFields value={form.short||blankShort()} onChange={v=>update('short',v)}/>}
        {form.format==='long'&&<label>卡片摘要<textarea name="summary" rows={3} maxLength={600} value={form.summary} onChange={e=>update('summary',e.target.value)} placeholder="留空则从正文生成"/></label>}
        <details open={form.format==='long'||undefined} className="body-editor"><summary>{form.format==='long'?'完整正文 *':'补充背景（可选）'}</summary><div className="editor-content-label"><label htmlFor="artifact-content">Markdown</label><div className="editor-mode"><button type="button" aria-pressed={!preview} onClick={()=>setPreview(false)}>编辑</button><button type="button" aria-pressed={preview} onClick={()=>setPreview(true)}>预览</button></div></div>{preview?<div className="editor-markdown-preview"><Markdown content={form.content}/></div>:<textarea id="artifact-content" className="markdown-editor" name="content" spellCheck={false} maxLength={200000} value={form.content} onChange={e=>update('content',e.target.value)}/>}</details>
      </section>
      <section className="admin-panel editor-section"><h2>出处与线索</h2><p className="section-description">让读者可以回到原帖，分清资料来源。</p><div className="form-grid"><label>BBS 原帖链接<input name="sourceUrl" type="url" value={form.sourceUrl} onChange={event => update('sourceUrl', event.target.value)} placeholder="https://bbs.example.edu/thread/..." maxLength={2048} /></label><label>来源标题<input name="sourceTitle" value={form.sourceTitle} onChange={event => update('sourceTitle', event.target.value)} maxLength={200} placeholder="原帖标题或来源说明" /></label><label>原帖作者<input name="author" value={form.author} onChange={event => update('author', event.target.value)} maxLength={100} placeholder="BBS 用户名" /></label><label>帖子 ID<input name="sourceThreadId" value={form.sourceThreadId} onChange={event => update('sourceThreadId', event.target.value)} maxLength={100} placeholder="可选，用于检索与溯源" /></label><label>外部唯一 ID<input name="externalId" value={form.externalId} onChange={event => update('externalId', event.target.value)} maxLength={200} placeholder="例如 bbs:123456" /></label><label>事件日期<input name="eventDate" type="date" value={form.eventDate} onChange={event => update('eventDate', event.target.value)} /></label></div></section>
      <section className="admin-panel editor-section"><div className="panel-heading"><h2>附件与资料</h2><span>{form.attachmentIds.length} / 20</span></div><input hidden ref={attachmentInput} type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt" onChange={event => { void upload(event, 'attachment'); }} /><div className="attachment-list">{form.attachmentIds.map(mediaId => { const file = attachments.find(item => item.id === mediaId); return <div key={mediaId}><FileText className="ico" /><span>{file?.originalName || mediaId}</span><IconButton icon={X} label={`移除附件：${file?.originalName || mediaId}`} onClick={() => update('attachmentIds', form.attachmentIds.filter(item => item !== mediaId))} /></div>; })}</div><div className="attachment-actions"><button type="button" className="secondary-button" disabled={uploading} onClick={() => attachmentInput.current?.click()}><Upload className="ico" />上传附件</button><button type="button" className="secondary-button" onClick={() => setPicker('attachment')}><Images className="ico" />从媒体库选择</button></div><p className="field-hint">支持图片、PDF、UTF-8 TXT。草稿附件不会向访客公开。</p></section>
    </div><aside className="editor-side-column"><section className="admin-panel editor-section"><h2>投放到信息流</h2><p className="field-hint">仅影响浏览流，不是隐私设置。全不选仍可通过公开链接与全局索引阅读；需隐藏请保存为草稿或归档。</p>{feedSettings.error && <ErrorNotice message={feedSettings.error} retry={feedSettings.reload}/>} {(feedSettings.data?.feeds||config.feeds).map(f=><label className="feed-check" key={f.id}><input type="checkbox" checked={form.feedIds.includes(f.id)} onChange={e=>update('feedIds',e.target.checked?[...form.feedIds,f.id]:form.feedIds.filter(id=>id!==f.id))}/><span>{f.label}<small>{!f.enabled?'已停用':!f.formats.includes(form.format)?'当前形式不会显示':f.id}</small></span></label>)}{form.feedIds.filter(id=>!(feedSettings.data?.feeds||config.feeds).some(f=>f.id===id)).map(id=><label className="feed-check" key={id}><input type="checkbox" checked onChange={()=>update('feedIds',form.feedIds.filter(v=>v!==id))}/><span>{id}<small>未配置的信息流</small></span></label>)}</section><section className="admin-panel editor-section"><h2>归档信息</h2><label>条目类型<select name="kind" value={form.kind} onChange={event => update('kind', event.target.value as ArtifactInput['kind'])}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>分类<input name="category" value={form.category} onChange={event => update('category', event.target.value)} maxLength={60} placeholder="如：校园生活、社区文化" /></label><label>标签<input name="tags" value={tagText} onChange={event => { setTagText(event.target.value); setDirty(true); }} placeholder="用逗号分隔" maxLength={1800} /></label><label>别名 / 曾用名<input name="aliases" value={aliasText} onChange={event => { setAliasText(event.target.value); setDirty(true); }} placeholder="用逗号分隔，便于检索人物或旧称" maxLength={1800} /></label><label>链接标识（slug）<input name="slug" value={form.slug} onChange={event => update('slug', event.target.value)} maxLength={120} placeholder="留空则从标题生成" /></label><p className="field-hint slug-hint">{config.siteUrl}/a/{form.slug || slugify(form.title || '条目标题')}</p></section>
      <section className="admin-panel editor-section"><h2>条目封面</h2><input ref={coverInput} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { void upload(event, 'cover'); }} />{coverUrl(form) ? <div className="editor-cover"><img src={coverUrl(form)} alt={form.coverAlt || '条目封面预览'} /><IconButton icon={X} label="移除封面" onClick={() => { setForm(current => ({ ...current, coverMediaId: '', coverUrl: '' })); setDirty(true); }} /></div> : <button type="button" className="cover-upload" disabled={uploading} onClick={() => coverInput.current?.click()}><ImagePlus className="ico" /><span>上传一张封面</span><small>没有图片也可以成为好条目</small></button>}<button className="media-library-link" type="button" onClick={() => setPicker('cover')}>从媒体库选择</button>{!form.coverMediaId && <label>或使用图片外链<input name="coverUrl" type="url" value={form.coverUrl} onChange={event => update('coverUrl', event.target.value)} placeholder="https://..." maxLength={2048} /></label>}<label>图片描述<input name="coverAlt" value={form.coverAlt} onChange={event => update('coverAlt', event.target.value)} maxLength={300} placeholder="描述图片，帮助读屏用户理解" /></label><label>图片署名 / 许可<input name="coverCredit" value={form.coverCredit} onChange={event => update('coverCredit', event.target.value)} maxLength={500} placeholder="作者、来源与许可信息" /></label></section>
      <div className="editor-note"><span className="mono">BEFORE PUBLISHING</span><p>核对事实、尊重原作者，并移除不应公开的个人信息。没有可靠来源的内容，先留在草稿里。</p></div>
    </aside></div></fieldset>
    <footer className="editor-footer"><span>{uploading ? '文件上传中…' : dirty ? '修改尚未保存' : '所有修改已保存'}</span><div><button type="button" className="secondary-button" disabled={saving || uploading} onClick={() => { void save('draft'); }}><Save className="ico" />{saving ? '保存中…' : '保存草稿'}</button><button type="button" className="admin-primary" disabled={saving || uploading} onClick={() => { void save('published'); }}><Send className="ico" />{saving ? '保存中…' : '保存并发布'}</button></div></footer>
    {picker && <MediaPicker imageOnly={picker === 'cover'} onClose={() => setPicker(null)} onSelect={file => { if (picker === 'attachment' && form.attachmentIds.length >= 20) { toast('每条内容最多添加 20 个附件。'); return; } selectMedia(file, picker); setPicker(null); }} />}
    {history && id && <RevisionDialog id={id} currentVersion={version} onClose={() => setHistory(false)} onRestore={artifact => { try { sessionStorage.removeItem(draftKey); } catch { /* Optional. */ } apply(artifact); setHistory(false); toast('历史版本已恢复，并保存为新版本。'); }} />}
  </form>;
}
