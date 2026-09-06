import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Asterisk, Orbit, Grid2X2, Settings2, Search, Shuffle, Bookmark, PanelsTopLeft, ArrowUp, ArrowDown, Share2, Expand } from 'lucide-react';
import type { ArtifactSummary, Theme } from '../../../shared/types';
import { useApp } from '../context';
import { IconButton } from './UI';
import { ArtifactImage } from './ArticleCards';

export interface LayoutProps {
  feed: ReactNode; theme: Theme; active: number; total: number; category: string; categories: string[];
  savedCount: number; savedCurrent: boolean; current?: ArtifactSummary; history: ArtifactSummary[];
  canNext: boolean; focused: boolean; loadingMore: boolean; moreError: string; randomLoading: boolean;
  onHome: () => void; onLibrary: () => void; onSaved: () => void; onSearch: () => void; onTheme: () => void;
  onCategory: (value: string) => void; onRandom: () => void; onPrev: () => void; onNext: () => void;
  onSave: () => void; onShare: () => void; onFocus: () => void; onJump: (id: string) => void; onRetryMore: () => void;
}
function ThemeButton({ theme, onClick }: { theme: Theme; onClick: () => void }) {
  return <button className="text-button theme-button" data-theme-trigger aria-label="选择阅读主题" title="选择阅读主题" onClick={onClick}><PanelsTopLeft className="ico" /><span>{theme === 'margin' ? '页外' : '游离'}</span></button>;
}
function Filters({ theme, category, categories, onCategory }: Pick<LayoutProps, 'theme' | 'category' | 'categories' | 'onCategory'>) {
  return <div className={`filter ${theme === 'drift' ? 'immersive-filter' : ''}`} role="group" aria-label="按分类浏览"><button aria-pressed={!category} onClick={() => onCategory('')}>{theme === 'margin' ? '偶然发现' : '随处漫游'}</button>{categories.map(name => <button key={name} aria-pressed={category === name} onClick={() => onCategory(name)}>{name}</button>)}</div>;
}
function MoreStatus({ loadingMore, moreError, onRetryMore }: Pick<LayoutProps, 'loadingMore' | 'moreError' | 'onRetryMore'>) {
  return moreError ? <button className="feed-status" onClick={onRetryMore} title={moreError}>加载失败 · 重试</button> : loadingMore ? <span className="feed-status" role="status">正在找下一条…</span> : null;
}
export function MarginLayout(p: LayoutProps) {
  const { config } = useApp();
  return <div className="editorial-shell">
    <aside className="editorial-rail" aria-label="辅助导航"><button className="rail-mark" aria-label="回到发现首页" onClick={p.onHome}><Asterisk className="ico" /></button><div className="rail-rule" /><div className="rail-type">CAMPUS / A SHARED MEMORY</div><div className="rail-bottom"><IconButton icon={Grid2X2} label="条目索引" onClick={p.onLibrary} /><Link to="/admin" className="icon-btn" aria-label="内容管理" title="内容管理"><Settings2 className="ico" /></Link></div></aside>
    <div className="editorial-main">
      <header className="editorial-header">
        <button className="editorial-brand" onClick={p.onHome} aria-label={`${config.siteName}，回到首页`} title={config.siteName}><strong>{config.shortName}</strong><span>CAMPUS WIKI</span></button>
        <nav className="editorial-nav" aria-label="主导航"><button className="current" onClick={p.onHome}>发现</button><button onClick={p.onSaved}>我的收藏<span className="saved-count">{String(p.savedCount).padStart(2, '0')}</span></button></nav>
        <div className="editorial-tools"><button className="mobile-only" onClick={p.onSaved} aria-label="我的收藏"><Bookmark className="ico" /></button><ThemeButton theme={p.theme} onClick={p.onTheme} /><button className="search-trigger" onClick={p.onSearch} aria-label="搜索 Wiki"><Search className="ico" /><span className="kbd">/</span></button><button className="text-button shuffle-button" onClick={p.onRandom} disabled={p.randomLoading || !p.total} aria-label="随机一条"><Shuffle className="ico" /><span>随便看看</span></button></div>
      </header>
      <div className="editorial-subhead"><Filters {...p} /><div className="issue-label">A JOURNAL OF <strong>CAMPUS MEMORIES</strong></div></div>
      {p.feed}
      <footer className="editorial-footer"><div className="footer-motto"><Asterisk className="ico" /><span>{config.tagline}</span></div><MoreStatus {...p} /><div className="editorial-pagination"><div className="page-numbers"><span className="now">{String(p.current ? p.active + 1 : 0).padStart(3, '0')}</span><span className="page-line" /><span className="total">{String(p.total).padStart(3, '0')}</span></div><div className="page-arrows"><IconButton icon={ArrowUp} label="上一条（↑ / K）" onClick={p.onPrev} disabled={p.active === 0} /><IconButton icon={ArrowDown} label="下一条（↓ / J）" onClick={p.onNext} disabled={!p.canNext} /></div></div></footer>
    </div>
  </div>;
}
export function DriftLayout(p: LayoutProps) {
  const { config } = useApp();
  return <div className={`immersive-shell ${p.focused ? 'focus-mode' : ''}`}>
    <header className="immersive-header" inert={p.focused}>
      <button className="immersive-brand" onClick={p.onHome} title={config.siteName} aria-label={`${config.siteName}，回到首页`}><Orbit className="ico" /><span className="brand-text"><strong>{config.shortName}</strong><span>CAMPUS / WIKI</span></span></button>
      <nav className="immersive-nav" aria-label="主导航"><button className="current" onClick={p.onHome}>漫游</button><button onClick={p.onSaved}>收藏<span className="saved-count">{String(p.savedCount).padStart(2, '0')}</span></button><button onClick={p.onLibrary}>条目索引</button></nav>
      <div className="immersive-tools"><button className="mobile-only" onClick={p.onSaved} aria-label="我的收藏"><Bookmark className="ico" /></button><ThemeButton theme={p.theme} onClick={p.onTheme} /><IconButton icon={Search} label="搜索 Wiki" onClick={p.onSearch} /></div>
    </header>
    <div inert={p.focused}><Filters {...p} /></div>
    {p.feed}
    <aside className="immersive-rail" aria-label="条目操作" inert={p.focused}>
      <IconButton icon={Bookmark} label={p.savedCurrent ? '取消收藏' : '收藏条目'} className={p.savedCurrent ? 'is-saved' : ''} aria-pressed={p.savedCurrent} onClick={p.onSave} disabled={!p.current} />
      <IconButton icon={Share2} label="分享条目" onClick={p.onShare} disabled={!p.current} />
      <IconButton icon={Expand} label="专注看图（F）" onClick={p.onFocus} disabled={!p.current?.coverUrl && !p.current?.coverMediaId} />
    </aside>
    <footer className="immersive-footer" inert={p.focused}>
      <div className="wander-hint"><ArrowDown className="ico" /><div>{config.tagline}<br /><span className="mono">SCROLL TO WANDER</span></div></div>
      <div className="filmstrip" aria-label="最近浏览的条目">{p.history.length ? p.history.map((a, index) => <button key={a.id} className="filmstrip-item" aria-current={a.id === p.current?.id} aria-label={`回到：${a.title}`} title={a.title} onClick={() => p.onJump(a.id)}><ArtifactImage artifact={a} /><span className="thumb-number">{String(index + 1).padStart(2, '0')}</span></button>) : <span className="history-empty">从一段校园记忆开始</span>}<button className="shuffle-end" onClick={p.onRandom} disabled={p.randomLoading || !p.total} aria-label="随机一条"><Shuffle className="ico" /></button></div>
      <MoreStatus {...p} /><div className="immersive-pagination"><div className="page-numbers"><span className="now">{String(p.current ? p.active + 1 : 0).padStart(2, '0')}</span><span>/</span><span className="total">{p.total}</span></div><IconButton icon={ArrowUp} label="上一条（↑ / K）" onClick={p.onPrev} disabled={p.active === 0} /><IconButton className="next-round" icon={ArrowDown} label="下一条（↓ / J）" onClick={p.onNext} disabled={!p.canNext} /></div>
    </footer>
    {p.focused && <button className="focus-exit" onClick={p.onFocus} autoFocus>退出专注<span className="kbd">Esc</span></button>}
  </div>;
}
