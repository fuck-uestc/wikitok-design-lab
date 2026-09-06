import { useState } from 'react';
import { ArrowUpRight, Bookmark, Share2, BookOpen, ImageOff } from 'lucide-react';
import type { ArtifactSummary, ImagePresentation } from '../../../shared/types';
import { kindLabels } from '../../../shared/types';
import { coverUrl } from '../api';
import { formatDate, IconButton } from './UI';

export interface CardProps {
  artifact: ArtifactSummary; index: number; saved: boolean; focused?: boolean;
  imagePresentation?: ImagePresentation;
  onRead: () => void; onSave: () => void; onShare: () => void; onImage: () => void;
}
export function ArtifactImage({ artifact, className = '', eager = false, onFailure }: { artifact: ArtifactSummary; className?: string; eager?: boolean; onFailure?: () => void }) {
  const [failed, setFailed] = useState(false);
  const [contained, setContained] = useState(false);
  const src = coverUrl(artifact);
  if (!src || failed) return <div className={`media-placeholder ${className}`} aria-label={failed ? '图片暂时无法显示' : '文字条目'}><span aria-hidden="true">{(artifact.category || '志').slice(0, 1)}</span>{failed && <ImageOff className="ico" />}</div>;
  return <img className={`${className} ${contained ? 'is-contained' : ''}`} src={src} alt={artifact.coverAlt || artifact.title} loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={event => { const image = event.currentTarget; setContained(image.naturalWidth < 900 || image.naturalHeight > image.naturalWidth * 1.3); }} onError={() => { setFailed(true); onFailure?.(); }} />;
}

function LongCard({ artifact: a, index, saved, imagePresentation = 'immersive', onRead, onSave, onShare, onImage }: CardProps) {
  const hasImage = !!coverUrl(a);
  const immersiveImage = hasImage && imagePresentation === 'immersive';
  return <div className={`entry-spread ${immersiveImage ? 'image-immersive' : hasImage ? 'with-media' : 'text-only'}`}>
    {immersiveImage && <button className="entry-background" onClick={onImage} aria-label="查看完整图片"><ArtifactImage artifact={a} className="entry-background-image" eager={index < 2} /></button>}
    <div className="entry-copy"><div className="entry-kicker"><span className="format-badge">长文</span><span>{a.category || kindLabels[a.kind]}</span><small>{String(index+1).padStart(3,'0')}</small></div>
      <h1 className="entry-title">{a.title}</h1>
      {a.author && <p className="entry-byline">{a.author}</p>}
      <p className="entry-summary">{a.summary}</p>
      <div className="entry-actions"><button className="pill-button" onClick={onRead}>阅读全文<ArrowUpRight className="ico" /></button><IconButton icon={Bookmark} label={saved ? '取消收藏' : '收藏条目'} aria-pressed={saved} onClick={onSave} /><IconButton icon={Share2} label="分享条目" onClick={onShare} /></div>
      <div className="entry-provenance"><span>{a.sourceTitle || (a.sourceUrl ? '有来源链接' : '编者整理')}</span><time>{formatDate(a.eventDate || a.updatedAt)}</time></div>
    </div>
    {hasImage && !immersiveImage && <figure className="entry-media"><button onClick={onImage} aria-label="查看完整图片"><ArtifactImage artifact={a} eager={index < 2} /></button>{a.coverCredit && <figcaption>{a.coverCredit}</figcaption>}</figure>}
  </div>;
}
export const MarginCard = LongCard;
export const DriftCard = LongCard;
