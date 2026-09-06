import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { Asterisk } from 'lucide-react';
import type { ArtifactSummary, ContentFormat, Taxonomy, Theme } from '../../shared/types';
import { api, isAbort, messageOf } from './api';
import { useApp } from './context';
import { useFeed } from './hooks/useFeed';
import { useSaved } from './hooks/useLibrary';
import { DriftCard, MarginCard } from './components/ArticleCards';
import { ShortCard } from './components/ShortCard';
import { FeedViewport, type FeedHandle } from './components/FeedViewport';
import { DriftLayout, MarginLayout, type LayoutProps } from './components/Layouts';
import { ImageDialog, LibraryDialog, ReaderDialog, ShareDialog, ThemeDialog } from './components/PublicDialogs';
import { ErrorNotice, Loading } from './components/UI';

const THEME_KEY = 'campus-wiki:theme:v1';
export default function PublicApp() {
  const { config, configError, reloadConfig, toast } = useApp();
  const navigate = useNavigate();
  const readerMatch = useMatch('/a/:slug');
  const feedMatch = useMatch('/f/:feedId');
  const [params] = useSearchParams();
  const feedId = feedMatch?.params.feedId || params.get('feed') || config.defaultFeed;
  const definition = config.feeds.find(f => f.id === feedId);
  const requestedFormat = params.get('format');
  const format: ContentFormat | '' = requestedFormat === 'long' || requestedFormat === 'short' ? requestedFormat : '';
  const category = params.get('category') || '';
  const contextKey = `${feedId}:${format}:${category}`;
  const contextRef = useRef(contextKey); contextRef.current = contextKey;
  const [theme, setTheme] = useState<Theme>(() => { try { const value = localStorage.getItem(THEME_KEY); if (value === 'margin' || value === 'drift') return value; } catch { /* Optional storage. */ } return config.defaultTheme; });
  const [active, setActive] = useState(0);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ categories: [], tags: [] });
  const [showTheme, setShowTheme] = useState(false);
  const [library, setLibrary] = useState<'all'|'saved'|'search'|null>(null);
  const [image, setImage] = useState<ArtifactSummary|null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [randomLoading, setRandomLoading] = useState(false);
  const [pendingId, setPendingId] = useState('');
  const [pendingNext, setPendingNext] = useState<number|null>(null);
  const feedRef = useRef<FeedHandle>(null);
  const randomAbort = useRef<AbortController|null>(null);
  const feed = useFeed(category, feedId, format);
  const saved = useSaved();
  const current = feed.items[active];
  const onActive = useCallback((index: number) => setActive(index), []);
  useLayoutEffect(() => {
    document.body.dataset.theme = theme === 'margin' ? 'editorial' : 'immersive';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'margin' ? '#f6f5ef' : '#111713');
  }, [theme]);
  useEffect(() => { setActive(0); setPendingNext(null); setPendingId(''); randomAbort.current?.abort(); setRandomLoading(false); }, [contextKey]);
  useEffect(() => {
    const controller = new AbortController();
    setTaxonomy({categories:[],tags:[]});
    api<Taxonomy>(`/taxonomy?${new URLSearchParams({ feed: feedId, ...(format ? {format} : {}) })}`, {signal:controller.signal}).then(setTaxonomy).catch(()=>{});
    return ()=>controller.abort();
  }, [feedId, format]);
  useEffect(() => () => randomAbort.current?.abort(), []);
  useEffect(() => { if (active >= feed.items.length-3 && feed.cursor && !feed.loadingMore && !feed.moreError) void feed.loadMore(); }, [active, feed.items.length, feed.cursor, feed.loadingMore, feed.moreError, feed.loadMore]);
  useEffect(() => {
    if (pendingId) { const i=feed.items.findIndex(a=>a.id===pendingId); if(i>=0){feedRef.current?.jump(i,true);setActive(i);setPendingId('');} }
    if (pendingNext !== null && pendingNext < feed.items.length) { feedRef.current?.jump(pendingNext); setPendingNext(null); }
  }, [feed.items,pendingId,pendingNext]);
  const streamQuery = () => new URLSearchParams({ feed: feedId, ...(format?{format}:{}), ...(category?{category}:{}) });
  function changeFilter(next: {feed?:string; format?:ContentFormat|''; category?:string}) {
    const id=next.feed || feedId;
    const p=new URLSearchParams();
    if (!next.feed) { const f=next.format ?? format; const c=next.category ?? category; if(f)p.set('format',f);if(c)p.set('category',c); }
    navigate(`/f/${encodeURIComponent(id)}${p.size?'?'+p:''}`);
  }
  function read(a: ArtifactSummary) { setLibrary(null); navigate(`/a/${encodeURIComponent(a.slug)}?${streamQuery()}`); }
  function closeReader() { const p=streamQuery();p.delete('feed');navigate(`/f/${encodeURIComponent(feedId)}${p.size?'?'+p:''}`, {replace:true}); }
  function next() { if (active < feed.items.length-1) feedRef.current?.jump(active+1); else if(feed.cursor){setPendingNext(active+1);void feed.loadMore();} }
  function chooseTheme(value: Theme) {setTheme(value);setShowTheme(false);try{localStorage.setItem(THEME_KEY,value);}catch{toast('主题仅在本次浏览中保留。');}}
  async function random() {
    if(randomLoading)return;
    const key=contextKey;const controller=new AbortController();randomAbort.current=controller;setRandomLoading(true);
    try {const a=await api<ArtifactSummary>(`/artifacts/random?${streamQuery()}`,{signal:controller.signal});if(contextRef.current!==key)return;feed.include(a);setPendingId(a.id);}
    catch(e){if(!isAbort(e))toast(messageOf(e));}finally{if(contextRef.current===key)setRandomLoading(false);}
  }
  async function share(a?: ArtifactSummary) {
    if(!a)return;const url=new URL(`/a/${encodeURIComponent(a.slug)}?${streamQuery()}`,config.siteUrl).href;
    if(navigator.share){try{await navigator.share({title:a.title,url});return;}catch(e){if(isAbort(e))return;}}
    try{await navigator.clipboard.writeText(url);toast('分享链接已复制');}catch{setShareUrl(url);}
  }
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{
    if(e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;
    const target=e.target as HTMLElement;if(target.matches('input,textarea,select')||target.isContentEditable)return;
    if(e.key==='/'){e.preventDefault();setLibrary('search');}
    else if(['ArrowDown','j','J'].includes(e.key)){e.preventDefault();next();}
    else if(['ArrowUp','k','K'].includes(e.key)){e.preventDefault();feedRef.current?.jump(active-1);}
    else if(['b','B'].includes(e.key)&&current){e.preventDefault();saved.toggle(current.id);}
  };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);});
  const empty=feed.loading?<Loading text="正在翻开档案…"/>:feed.error?<div className="feed-empty"><ErrorNotice message={feed.error} retry={feed.retry}/>{!definition&&<button className="pill-button" onClick={()=>changeFilter({feed:config.defaultFeed})}>回到默认信息流</button>}</div>:<div className="feed-empty"><Asterisk className="empty-mark"/><h1>这一页，暂时留白。</h1><p>已发布且投放到此信息流的内容会出现在这里。</p>{(category||format)&&<button className="pill-button" onClick={()=>changeFilter({category:'',format:''})}>清除筛选</button>}</div>;
  const viewport=<FeedViewport ref={feedRef} theme={theme} items={feed.items} active={active} onActive={onActive} empty={empty} renderCard={(a,index)=>{
    const p={artifact:a,index,saved:saved.ids.includes(a.id),onRead:()=>read(a),onSave:()=>saved.toggle(a.id),onShare:()=>{void share(a);},onImage:()=>setImage(a)};
    return a.format==='short'?<ShortCard {...p}/>:theme==='margin'?<MarginCard {...p}/>:<DriftCard {...p}/>;
  }}/>;
  const layout: LayoutProps={feed:viewport,theme,active,total:feed.total,category,categories:taxonomy.categories.map(t=>t.name),feedId,format,onFeed:id=>changeFilter({feed:id}),onFormat:value=>changeFilter({format:value,category:''}),savedCount:saved.ids.length,current,canNext:active<feed.items.length-1||!!feed.cursor,loadingMore:feed.loadingMore,moreError:feed.moreError,randomLoading,onHome:()=>changeFilter({feed:config.defaultFeed}),onLibrary:()=>setLibrary('all'),onSaved:()=>setLibrary('saved'),onSearch:()=>setLibrary('search'),onTheme:()=>setShowTheme(true),onCategory:value=>changeFilter({category:value}),onRandom:()=>{void random();},onPrev:()=>feedRef.current?.jump(active-1),onNext:next,onRetryMore:()=>{void feed.loadMore();}};
  return <><a className="skip-link" href="#feed">跳到内容</a>{theme==='margin'?<MarginLayout {...layout}/>:<DriftLayout {...layout}/>}
    {configError&&<div className="config-warning"><button onClick={reloadConfig}>配置加载失败，重试</button></div>}
    <div className="sr-only" aria-live="polite">{current?`${active+1}，${current.title}`:''}</div>
    {showTheme&&<ThemeDialog theme={theme} onTheme={chooseTheme} onClose={()=>setShowTheme(false)}/>}
    {library&&<LibraryDialog mode={library} scope={{feed:feedId,format}} savedIds={saved.ids} onClose={()=>setLibrary(null)} onRead={read} onSave={saved.toggle}/>}
    {readerMatch&&<ReaderDialog key={readerMatch.params.slug} slug={readerMatch.params.slug!} scope={{feed:feedId,format}} savedIds={saved.ids} onSave={saved.toggle} onClose={closeReader} onRead={read}/>}
    {image&&<ImageDialog artifact={image} onClose={()=>setImage(null)}/>}{shareUrl&&<ShareDialog url={shareUrl} onClose={()=>setShareUrl('')}/>}
  </>;
}
