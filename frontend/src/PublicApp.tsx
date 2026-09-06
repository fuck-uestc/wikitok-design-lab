import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import { Asterisk, ArrowUpRight } from 'lucide-react';
import type { ArtifactSummary, Taxonomy, Theme } from '../../shared/types';
import { api, isAbort, messageOf } from './api';
import { useApp } from './context';
import { useFeed } from './hooks/useFeed';
import { useSaved } from './hooks/useLibrary';
import { DriftCard, MarginCard } from './components/ArticleCards';
import { FeedViewport, type FeedHandle } from './components/FeedViewport';
import { DriftLayout, MarginLayout, type LayoutProps } from './components/Layouts';
import { ImageDialog, LibraryDialog, ReaderDialog, ShareDialog, ThemeDialog } from './components/PublicDialogs';
import { ErrorNotice, Loading } from './components/UI';

const THEME_KEY = 'campus-wiki:theme:v1';
export default function PublicApp() {
  const { config, toast } = useApp();
  const navigate = useNavigate();
  const readerMatch = useMatch('/a/:slug');
  const chosenTheme = useRef(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem(THEME_KEY); if (saved === 'margin' || saved === 'drift') { chosenTheme.current = true; return saved; } } catch { /* Session-only theme still works. */ }
    return config.defaultTheme;
  });
  const [category, setCategory] = useState('');
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ categories: [], tags: [] });
  const [active, setActive] = useState(0);
  const [history, setHistory] = useState<ArtifactSummary[]>([]);
  const [focused, setFocused] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [library, setLibrary] = useState<'all' | 'saved' | 'search' | null>(null);
  const [image, setImage] = useState<ArtifactSummary | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [randomLoading, setRandomLoading] = useState(false);
  const [pendingId, setPendingId] = useState('');
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const feedRef = useRef<FeedHandle>(null);
  const feed = useFeed(category);
  const saved = useSaved();
  const current = feed.items[active];
  const onActive = useCallback((index: number) => setActive(index), []);
  useEffect(() => { if (!chosenTheme.current) setTheme(config.defaultTheme); }, [config.defaultTheme]);
  useLayoutEffect(() => {
    document.body.dataset.theme = theme === 'margin' ? 'editorial' : 'immersive';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'margin' ? '#f6f5ef' : '#0b0e10');
  }, [theme]);
  useEffect(() => {
    const controller = new AbortController();
    api<Taxonomy>('/taxonomy', { signal: controller.signal }).then(setTaxonomy).catch(() => {});
    return () => controller.abort();
  }, [feed.total]);
  useEffect(() => {
    if (current) setHistory(old => old.some(a => a.id === current.id) ? old : [...old, current].slice(-6));
  }, [current]);
  useEffect(() => {
    if (active >= feed.items.length - 3 && feed.cursor && !feed.loadingMore && !feed.moreError) void feed.loadMore();
  }, [active, feed.items.length, feed.cursor, feed.loadingMore, feed.moreError, feed.loadMore]);
  useEffect(() => {
    if (pendingId) {
      const index = feed.items.findIndex(a => a.id === pendingId);
      if (index >= 0) { feedRef.current?.jump(index, true); setActive(index); setPendingId(''); }
    }
    if (pendingIndex !== null && pendingIndex < feed.items.length) { feedRef.current?.jump(pendingIndex); setPendingIndex(null); }
  }, [feed.items, pendingId, pendingIndex]);
  function changeCategory(value: string) { setActive(0); setPendingId(''); setPendingIndex(null); setCategory(value); feedRef.current?.jump(0, true); }
  function chooseTheme(value: Theme) {
    chosenTheme.current = true; setTheme(value); setFocused(false);
    try { localStorage.setItem(THEME_KEY, value); } catch { toast('主题已切换，当前浏览器仅临时保存。'); }
  }
  function read(a: ArtifactSummary) { setLibrary(null); navigate(`/a/${encodeURIComponent(a.slug)}`); }
  function next() {
    if (active < feed.items.length - 1) feedRef.current?.jump(active + 1);
    else if (feed.cursor) { setPendingIndex(active + 1); void feed.loadMore(); }
  }
  function jump(id: string) {
    const index = feed.items.findIndex(a => a.id === id);
    if (index >= 0) feedRef.current?.jump(index, true);
    else { const old = history.find(a => a.id === id); if (old) read(old); }
  }
  const categoryRef = useRef(category); categoryRef.current = category;
  const randomAbort = useRef<AbortController | null>(null);
  useEffect(() => () => randomAbort.current?.abort(), []);
  async function random() {
    if (randomLoading) return;
    const requestedCategory = category;
    const controller = new AbortController(); randomAbort.current = controller;
    setRandomLoading(true);
    try {
      const result = await api<ArtifactSummary>(`/artifacts/random?${new URLSearchParams({ category })}`, { signal: controller.signal });
      if (categoryRef.current !== requestedCategory) return;
      feed.include(result); setPendingId(result.id);
    } catch (error) { if (!isAbort(error)) toast(messageOf(error)); }
    finally { setRandomLoading(false); }
  }
  async function share(a?: ArtifactSummary) {
    if (!a) return;
    const url = new URL(`/a/${encodeURIComponent(a.slug)}`, config.siteUrl).href;
    if (navigator.share) {
      try { await navigator.share({ title: a.title, url }); return; }
      catch (error) { if (isAbort(error)) return; }
    }
    try { await navigator.clipboard.writeText(url); toast('分享链接已复制'); }
    catch { setShareUrl(url); }
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement;
      if (target.matches('input,textarea,select') || target.isContentEditable) return;
      if (event.key === 'Escape' && focused) { setFocused(false); return; }
      if (event.key === '/' && !focused) { event.preventDefault(); setLibrary('search'); }
      else if (['ArrowDown', 'j', 'J'].includes(event.key)) { event.preventDefault(); next(); }
      else if (['ArrowUp', 'k', 'K'].includes(event.key)) { event.preventDefault(); feedRef.current?.jump(active - 1); }
      else if (['b', 'B'].includes(event.key) && current) { event.preventDefault(); saved.toggle(current.id); }
      else if (['f', 'F'].includes(event.key) && theme === 'drift' && current && (current.coverMediaId || current.coverUrl)) setFocused(value => !value);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  const empty = feed.loading ? <Loading text="正在翻开校园记忆…" /> : feed.error ? <div className="feed-empty"><ErrorNotice message={feed.error} retry={feed.retry} /></div> : <div className="feed-empty"><Asterisk className="empty-mark" /><span className="mono">A SHARED MEMORY STARTS HERE</span><h1>{category ? '这一页，暂时留白。' : '校园的故事，\n从这里写起。'}</h1><p>{category ? '换一个分类，继续发现。' : config.description}</p>{category ? <button className="pill-button" onClick={() => changeCategory('')}>浏览全部条目<ArrowUpRight className="ico" /></button> : <Link to="/admin" className="pill-button">管理员添加第一条记忆<ArrowUpRight className="ico" /></Link>}</div>;
  const viewport = <FeedViewport ref={feedRef} theme={theme} items={feed.items} active={active} onActive={onActive} empty={empty} renderCard={(a, index) => {
    const props = { artifact: a, index, saved: saved.ids.includes(a.id), focused, onRead: () => read(a), onSave: () => saved.toggle(a.id), onShare: () => { void share(a); }, onImage: () => setImage(a) };
    return theme === 'margin' ? <MarginCard {...props} /> : <DriftCard {...props} />;
  }} />;
  const layout: LayoutProps = {
    feed: viewport, theme, active, total: feed.total, category, categories: taxonomy.categories.map(item => item.name), savedCount: saved.ids.length, savedCurrent: !!current && saved.ids.includes(current.id), current, history,
    canNext: active < feed.items.length - 1 || !!feed.cursor, focused, loadingMore: feed.loadingMore, moreError: feed.moreError, randomLoading,
    onHome: () => { changeCategory(''); navigate('/'); }, onLibrary: () => setLibrary('all'), onSaved: () => setLibrary('saved'), onSearch: () => setLibrary('search'), onTheme: () => setShowTheme(true),
    onCategory: changeCategory, onRandom: () => { void random(); }, onPrev: () => feedRef.current?.jump(active - 1), onNext: next,
    onSave: () => { if (current) saved.toggle(current.id); }, onShare: () => { void share(current); }, onFocus: () => setFocused(value => !value), onJump: jump, onRetryMore: () => { void feed.loadMore(); }
  };
  return <><a className="skip-link" href="#feed">跳到内容</a>{theme === 'margin' ? <MarginLayout {...layout} /> : <DriftLayout {...layout} />}
    <div className="sr-only" aria-live="polite">{current ? `${active + 1}，${current.title}` : ''}</div>
    {showTheme && <ThemeDialog theme={theme} onTheme={chooseTheme} onClose={() => setShowTheme(false)} />}
    {library && <LibraryDialog mode={library} savedIds={saved.ids} onClose={() => setLibrary(null)} onRead={read} onSave={saved.toggle} />}
    {readerMatch && <ReaderDialog key={readerMatch.params.slug} slug={readerMatch.params.slug!} savedIds={saved.ids} onSave={saved.toggle} onClose={() => navigate('/', { replace: true })} onRead={read} />}
    {image && <ImageDialog artifact={image} onClose={() => setImage(null)} />}
    {shareUrl && <ShareDialog url={shareUrl} onClose={() => setShareUrl('')} />}
  </>;
}
