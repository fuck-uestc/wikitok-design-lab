import type { ReactNode } from 'react';
import { Search, Bookmark, ArrowUp, ArrowDown, Shuffle, PanelsTopLeft, Asterisk } from 'lucide-react';
import type { ArtifactSummary, ContentFormat, Theme } from '../../../shared/types';
import { useApp } from '../context';
import { IconButton } from './UI';
export interface LayoutProps {
  feed: ReactNode; theme: Theme; active: number; total: number; category: string; categories: string[];
  savedCount: number; current?: ArtifactSummary;
  canNext: boolean; loadingMore: boolean; moreError: string; randomLoading: boolean;
  feedId: string; format: ContentFormat | ''; onFeed: (id: string) => void; onFormat: (format: ContentFormat | '') => void;
  onHome: () => void; onLibrary: () => void; onSaved: () => void; onSearch: () => void; onTheme: () => void;
  onCategory: (value: string) => void; onRandom: () => void; onPrev: () => void; onNext: () => void;
  onRetryMore: () => void;
}
function ReadingLayout(p: LayoutProps) {
  const { config } = useApp();
  const selected = config.feeds.find(f => f.id === p.feedId);
  return <div className={`reading-shell ${p.theme}`}>
    <aside className="reading-rail" aria-hidden="true"><Asterisk /><span>{config.tagline}</span><small>ARCHIVE<br />/</small></aside>
    <div className="reading-main">
      <header className="reading-header">
        <button className="reading-brand" onClick={p.onHome} title={config.siteName}><strong>{config.shortName}</strong><small>ON THE RECORD</small></button>
        <nav className="feed-nav" aria-label="信息流">{config.feeds.map(f => <button key={f.id} aria-current={f.id === p.feedId ? 'page' : undefined} onClick={() => p.onFeed(f.id)}>{f.label}</button>)}</nav>
        <div className="reading-tools"><button className="theme-trigger" data-theme-trigger aria-label="选择阅读主题" onClick={p.onTheme}><PanelsTopLeft className="ico" /><span>{p.theme === 'margin' ? '页外' : '游离'}</span></button><IconButton icon={Search} label="搜索（/）" onClick={p.onSearch} /><button className="saved-trigger" aria-label="我的收藏" onClick={p.onSaved}><Bookmark className="ico" /><small>{p.savedCount || ''}</small></button></div>
      </header>
      <div className="reading-subhead">
        <div className="format-filter" role="group" aria-label="内容形式">{(selected?.formats.length || 0) > 1 ? <>{([['','全部'],['long','长文'],['short','切片']] as const).map(([value, label]) => <button key={value} aria-pressed={p.format === value} onClick={() => p.onFormat(value)}>{label}</button>)}</> : <span className="stream-caption">{selected?.description || '信息流暂不可用'}</span>}</div>
        <div className="subhead-tools">{p.categories.length > 0 && <select aria-label="按分类筛选" value={p.category} onChange={e => p.onCategory(e.target.value)}><option value="">全部主题</option>{p.categories.map(c => <option key={c}>{c}</option>)}</select>}<button onClick={p.onLibrary}>条目索引 <span aria-hidden="true">↗</span></button></div>
      </div>
      {p.feed}
      <footer className="reading-footer"><div className="reading-position"><strong>{String(p.current ? p.active + 1 : 0).padStart(2,'0')}</strong><small>/ {String(p.total).padStart(2,'0')}</small><span className="position-track"><i style={{ width: `${p.total ? Math.min(100, (p.active + 1) / p.total * 100) : 0}%` }} /></span></div>
        <div className="reading-status">{p.moreError ? <button onClick={p.onRetryMore}>加载失败，重试</button> : p.loadingMore ? '正在加载…' : <span>向下滑动 <span aria-hidden="true">·</span> 或使用 ↑ ↓</span>}</div>
        <div className="reading-pagination"><IconButton icon={Shuffle} label="随机一条" onClick={p.onRandom} disabled={p.randomLoading || !p.total} /><IconButton icon={ArrowUp} label="上一条（↑ / K）" onClick={p.onPrev} disabled={p.active === 0} /><IconButton icon={ArrowDown} label="下一条（↓ / J）" onClick={p.onNext} disabled={!p.canNext} /></div>
      </footer>
    </div>
  </div>;
}
export function MarginLayout(p: LayoutProps) { return <ReadingLayout {...p} />; }
export function DriftLayout(p: LayoutProps) { return <ReadingLayout {...p} />; }
