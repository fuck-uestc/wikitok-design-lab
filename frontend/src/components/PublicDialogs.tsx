import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, Search, ArrowUpRight, FileText, Settings2, Copy } from 'lucide-react';
import type { Artifact, ArtifactSummary, Page, Theme } from '../../../shared/types';
import { kindLabels } from '../../../shared/types';
import { api, coverUrl, isAbort, mediaUrl, messageOf } from '../api';
import { useApp } from '../context';
import { Dialog, ErrorNotice, ExternalLink, formatDate, IconButton, Loading, Markdown } from './UI';
import { ArtifactImage } from './ArticleCards';

export function ThemeDialog({ theme, onTheme, onClose }: { theme: Theme; onTheme: (value: Theme) => void; onClose: () => void }) {
  const { config } = useApp();
  return <Dialog title="换一种方式，读校园。" onClose={onClose} className="theme-dialog"><div className="theme-dialog-body"><p>同一份记忆，两种阅读心情。你的选择会保留在当前浏览器。</p><div className="theme-options">
    <button className="theme-option" aria-pressed={theme === 'margin'} onClick={() => onTheme('margin')}><div className="theme-preview preview-margin"><i /><div><b /><b /><span /></div><em>页</em></div><strong>页外 <small>MARGIN</small>{theme === 'margin' && <Check className="ico" />}</strong><p>纸页般的留白，图文并排慢慢读。</p></button>
    <button className="theme-option" aria-pressed={theme === 'drift'} onClick={() => onTheme('drift')}><div className="theme-preview preview-drift"><i /><div><b /><b /><span /></div><em>游</em></div><strong>游离 <small>DRIFT</small>{theme === 'drift' && <Check className="ico" />}</strong><p>一屏一段故事，沉浸在校园记忆里。</p></button>
  </div><div className="about-site"><strong>{config.siteName}</strong><p>{config.description}</p><p className="shortcut-help">↑ / ↓ 切换条目 · B 收藏 · / 搜索 · Esc 关闭</p><div>{config.bbsBaseUrl && <ExternalLink href={config.bbsBaseUrl}>回到校园 BBS</ExternalLink>}<Link to="/admin"><Settings2 className="ico" />内容管理</Link></div></div></div></Dialog>;
}

export function LibraryDialog({ mode: initialMode, savedIds, onClose, onRead, onSave }: { mode: 'all' | 'saved' | 'search'; savedIds: string[]; onClose: () => void; onRead: (artifact: ArtifactSummary) => void; onSave: (id: string) => void }) {
  const [mode, setMode] = useState(initialMode === 'saved' ? 'saved' : 'all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ArtifactSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [visible, setVisible] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const moreController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => { search.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    moreController.current?.abort();
    setLoading(true); setError(''); setVisible(20); setLoadingMore(false);
    const timer = setTimeout(async () => {
      try {
        if (mode === 'saved') {
          const chunks = Array.from({ length: Math.ceil(savedIds.length / 100) }, (_, index) => savedIds.slice(index * 100, (index + 1) * 100));
          const results = await Promise.all(chunks.map(ids => api<Page<ArtifactSummary>>(`/artifacts?${new URLSearchParams({ ids: ids.join(','), q: query, limit: '100' })}`, { signal: controller.signal })));
          if (controller.signal.aborted) return;
          const all = results.flatMap(result => result.items);
          setItems(all); setTotal(all.length); setCursor(null);
        } else {
          const result = await api<Page<ArtifactSummary>>(`/artifacts?${new URLSearchParams({ q: query, limit: '20' })}`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          setItems(result.items); setTotal(result.total); setCursor(result.nextCursor);
        }
      } catch (failure) { if (!isAbort(failure)) setError(messageOf(failure)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); moreController.current?.abort(); };
  }, [mode, query, savedIds, reload]);
  async function more() {
    if (mode === 'saved') { setVisible(n => n + 20); return; }
    if (!cursor || loadingMore) return;
    const controller = new AbortController(); moreController.current = controller;
    const currentGeneration = generation.current;
    setLoadingMore(true); setError('');
    try {
      const result = await api<Page<ArtifactSummary>>(`/artifacts?${new URLSearchParams({ q: query, limit: '20', cursor })}`, { signal: controller.signal });
      if (currentGeneration !== generation.current) return;
      setItems(previous => [...previous, ...result.items.filter(a => !previous.some(p => p.id === a.id))]); setCursor(result.nextCursor); setVisible(n => n + 20);
    } catch (failure) { if (!isAbort(failure)) setError(messageOf(failure)); }
    finally { if (currentGeneration === generation.current) setLoadingMore(false); }
  }
  return <Dialog title={initialMode === 'search' ? '找一段校园记忆。' : mode === 'saved' ? '收藏，不着急读完。' : '校园记忆的索引。'} onClose={onClose}>
    <div className="library-intro"><div className="library-tabs"><button aria-pressed={mode === 'all'} onClick={() => setMode('all')}>全部条目</button><button aria-pressed={mode === 'saved'} onClick={() => setMode('saved')}>我的收藏</button></div><p>{mode === 'saved' ? '收藏保存在当前浏览器，已下架的条目暂不显示。' : '搜索标题、正文、作者、人物别名、标签或帖子 ID。'}</p><label className="search-box"><Search className="ico" /><input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="搜索词条、人物或记忆片段" aria-label="搜索条目" /></label></div>
    <div className="result-list">{loading ? <Loading /> : <>
      <div className="result-count">{total} 条{mode === 'saved' ? '可访问的收藏' : '结果'}</div>
      {items.slice(0, visible).map(a => <div className="library-result" key={a.id}><button className="result-item" onClick={() => onRead(a)}><ArtifactImage artifact={a} className="result-thumb" /><span className="result-meta"><strong>{a.title}</strong><span>{a.category || kindLabels[a.kind]}{a.author && ` · @${a.author}`}</span><p>{a.summary}</p></span><ArrowUpRight className="ico" /></button><IconButton icon={Bookmark} label={savedIds.includes(a.id) ? `取消收藏：${a.title}` : `收藏：${a.title}`} className={savedIds.includes(a.id) ? 'is-saved' : ''} onClick={() => onSave(a.id)} aria-pressed={savedIds.includes(a.id)} /></div>)}
      {!items.length && !error && <div className="empty-state"><Search className="ico" /><h3>{query ? '还没有找到这段记忆' : mode === 'saved' ? '把想再读的故事留在这里' : '第一段校园记忆，等你写下'}</h3><p>{query ? '试试其他关键词，或搜索作者与别名。' : mode === 'saved' ? '点击条目旁的书签，就能随时回来。' : '管理员发布内容后，会出现在这里。'}</p></div>}
      {(cursor || visible < items.length) && <button className="load-more" disabled={loadingMore} onClick={more}>{loadingMore ? '正在载入…' : '再看一些'}</button>}
    </>}{error && <ErrorNotice message={error} retry={() => setReload(n => n + 1)} />}</div>
  </Dialog>;
}

export function ReaderDialog({ slug, savedIds, onSave, onClose, onRead }: { slug: string; savedIds: string[]; onSave: (id: string) => void; onClose: () => void; onRead: (artifact: ArtifactSummary) => void }) {
  const [article, setArticle] = useState<Artifact | null>(null);
  const [related, setRelated] = useState<ArtifactSummary[]>([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setArticle(null); setRelated([]); setError('');
    api<Artifact>(`/artifacts/${encodeURIComponent(slug)}`, { signal: controller.signal }).then(async a => {
      setArticle(a);
      if (a.category) {
        try { const result = await api<Page<ArtifactSummary>>(`/artifacts?${new URLSearchParams({ category: a.category, limit: '4' })}`, { signal: controller.signal }); setRelated(result.items.filter(item => item.id !== a.id).slice(0, 3)); } catch { /* The reader remains available when related entries fail. */ }
      }
    }).catch(failure => { if (!isAbort(failure)) setError(messageOf(failure)); });
    return () => controller.abort();
  }, [slug, reload]);
  return <Dialog title="停一会，读一读。" onClose={onClose} className="read-dialog">
    {!article ? error ? <div className="read-body"><ErrorNotice message={error} retry={() => setReload(n => n + 1)} /></div> : <Loading /> : <div className="read-body">
      {coverUrl(article) && <ArtifactImage artifact={article} className="read-cover" eager />}
      <div className="reader-kicker mono">{article.category || kindLabels[article.kind]}</div><h1 className="read-title">{article.title}</h1>
      <div className="reader-meta">{article.author && <span>@{article.author}</span>}<span>更新于 {formatDate(article.updatedAt)}</span>{article.eventDate && <span>发生于 {article.eventDate}</span>}</div>
      {article.aliases.length > 0 && <p className="reader-aliases">又称：{article.aliases.join('、')}</p>}
      <Markdown content={article.content} />
      {article.tags.length > 0 && <div className="tag-list">{article.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
      {(article.sourceUrl || article.coverCredit) && <div className="source-block">{article.sourceUrl && <ExternalLink href={article.sourceUrl}>{article.sourceTitle || '查看 BBS 原帖'}{article.sourceThreadId && ` · #${article.sourceThreadId}`}</ExternalLink>}{article.coverCredit && <div className="credit">图像署名：{article.coverCredit}</div>}</div>}
      {article.attachments.length > 0 && <section className="reader-attachments"><h2>附件与资料</h2>{article.attachments.map(file => <a key={file.id} href={mediaUrl(file.url)} target="_blank" rel="noopener noreferrer"><FileText className="ico" /><span>{file.originalName}<small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span><ArrowUpRight className="ico" /></a>)}</section>}
      <div className="read-actions"><button className="pill-button" onClick={() => onSave(article.id)}><Bookmark className="ico" />{savedIds.includes(article.id) ? '移出我的收藏' : '收藏这条记忆'}</button><span className="reader-version">第 {article.version} 版</span></div>
      {related.length > 0 && <div className="related"><div className="related-title">在「{article.category}」里继续逛逛</div><div className="related-row">{related.map(item => <button key={item.id} onClick={() => onRead(item)}>{item.title} ↗</button>)}</div></div>}
    </div>}
  </Dialog>;
}

export function ImageDialog({ artifact, onClose }: { artifact: ArtifactSummary; onClose: () => void }) {
  return <Dialog title="完整图片" onClose={onClose} className="full-image-dialog"><div className="full-image-body"><img src={coverUrl(artifact)} alt={artifact.coverAlt || artifact.title} /><p>{artifact.coverCredit}</p></div></Dialog>;
}
export function ShareDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const { toast } = useApp();
  return <Dialog title="把这段记忆分享出去。" onClose={onClose}><div className="share-body"><p>复制链接，邀请朋友一起读。</p><input className="copy-input" value={url} readOnly aria-label="条目分享链接" onFocus={event => event.currentTarget.select()} /><button className="pill-button" onClick={async () => {
    try { await navigator.clipboard.writeText(url); toast('链接已复制'); onClose(); } catch { toast('请选中上方链接，手动复制。'); }
  }}><Copy className="ico" />复制链接</button></div></Dialog>;
}
