import { useState } from 'react';
import { ArrowUpRight, Bookmark, Share2, BookOpen, ImageOff } from 'lucide-react';
import type { ArtifactSummary } from '../../../shared/types';
import { kindLabels } from '../../../shared/types';
import { coverUrl } from '../api';
import { formatDate, IconButton } from './UI';

export interface CardProps {
  artifact: ArtifactSummary; index: number; saved: boolean; focused?: boolean;
  onRead: () => void; onSave: () => void; onShare: () => void; onImage: () => void;
}
export function ArtifactImage({ artifact, className = '', eager = false, onFailure }: { artifact: ArtifactSummary; className?: string; eager?: boolean; onFailure?: () => void }) {
  const [failed, setFailed] = useState(false);
  const [contained, setContained] = useState(false);
  const src = coverUrl(artifact);
  if (!src || failed) return <div className={`media-placeholder ${className}`} aria-label={failed ? '图片暂时无法显示' : '文字条目'}><span aria-hidden="true">{(artifact.category || '志').slice(0, 1)}</span>{failed && <ImageOff className="ico" />}</div>;
  return <img className={`${className} ${contained ? 'is-contained' : ''}`} src={src} alt={artifact.coverAlt || artifact.title} loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={event => { const image = event.currentTarget; setContained(image.naturalWidth < 900 || image.naturalHeight > image.naturalWidth * 1.3); }} onError={() => { setFailed(true); onFailure?.(); }} />;
}
export function MarginCard({ artifact: a, index, saved, onRead, onSave, onShare, onImage }: CardProps) {
  const hasImage = !!coverUrl(a);
  return <div className="spread">
    <div className="story-copy">
      <div className="story-label"><span>{a.category || kindLabels[a.kind]}</span><span className="mono">NO. {String(index + 1).padStart(3, '0')}</span></div>
      <h1 className={`story-title ${a.title.length > 32 ? 'long-title' : ''}`}>{a.title}</h1>
      {(a.author || a.aliases.length > 0) && <p className="story-english">{a.author ? `@${a.author}` : a.aliases.slice(0, 3).join(' / ')}</p>}
      <p className="story-excerpt">{a.summary}</p>
      <div className="story-actions">
        <button className="pill-button" onClick={onRead}>展开这条记忆<ArrowUpRight className="ico" /></button>
        <IconButton icon={Bookmark} label={saved ? '取消收藏' : '收藏条目'} className={saved ? 'is-saved' : ''} aria-pressed={saved} onClick={onSave} />
        <IconButton icon={Share2} label="分享条目" onClick={onShare} />
      </div>
      <div className="story-footnote"><span className="tiny-rule" /><p><b>{a.sourceTitle || (a.sourceUrl ? '收录自校园 BBS' : '校园共建条目')}</b><br />更新于 {formatDate(a.updatedAt)}{a.sourceThreadId && ` · #${a.sourceThreadId}`}</p></div>
    </div>
    <div className="plate-wrap">
      <button className={`plate ${hasImage ? 'photo' : 'no-image'}`} onClick={hasImage ? onImage : onRead} aria-label={hasImage ? '查看完整图片' : '阅读文字条目'}>
        <ArtifactImage artifact={a} className="plate-image" eager={index < 2} />
        <div className="plate-top"><span className="mono">FIG. {String(index + 1).padStart(3, '0')} / CAMPUS ARCHIVE</span><span className="plate-corner" /></div>
        <div className="plate-title" aria-hidden="true">{kindLabels[a.kind]}<span className="plate-subtitle">A memory worth keeping.</span></div>
      </button>
      <div className="plate-caption"><span>CAMPUS / COLLECTIVE MEMORY</span><span>{a.coverCredit || (hasImage ? '' : '以文字，存下共同的记忆。')}</span></div>
    </div>
  </div>;
}
export function DriftCard({ artifact: a, index, focused, onRead }: CardProps) {
  const hasImage = !!coverUrl(a);
  return <>
    <div className={`immersive-art ${hasImage ? 'photo' : 'no-image'}`}><ArtifactImage artifact={a} className="immersive-img" eager={index < 2} /></div>
    <div className="exhibit-top-note">CAMPUS / COLLECTIVE MEMORY<br />EXHIBIT {String(index + 1).padStart(3, '0')}</div><div className="exhibit-corner" />
    <div className="immersive-copy" inert={focused}>
      <div className="exhibit-label">{a.category || kindLabels[a.kind]}<span>—</span>{String(index + 1).padStart(2, '0')}</div>
      <h1 className={`immersive-title ${a.title.length > 25 ? 'long-title' : ''}`}>{a.title}</h1>
      {a.author && <p className="immersive-english">@{a.author}</p>}
      <p className="immersive-excerpt">{a.summary}</p>
      <div className="immersive-actions"><button className="pill-button" onClick={onRead}>走进这条记忆<ArrowUpRight className="ico" /></button>{a.sourceUrl && <button className="mini-source" onClick={onRead}><BookOpen className="ico" />查看出处</button>}</div>
    </div>
    {a.eventDate && <div className="image-fact" aria-hidden={focused}><strong>{a.eventDate.slice(0, 4)}</strong><span>{a.eventDate.slice(5).replace('-', ' / ')} · 记忆发生的日子</span></div>}
    {a.coverCredit && <div className="exhibit-caption">{a.coverCredit}</div>}
  </>;
}
