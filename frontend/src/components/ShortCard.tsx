import { ArrowUpRight, Bookmark, Share2, FileText } from 'lucide-react';
import { shortLayoutLabels, verificationLabels } from '../../../shared/feeds';
import type { ShortContent } from '../../../shared/types';
import { coverUrl } from '../api';
import { ArtifactImage, type CardProps } from './ArticleCards';
import { formatDate, IconButton } from './UI';
export function ShortText({ short: s }: { short: ShortContent }) {
  if (s.layout === 'comparison') return <div className="comparison-pair">{s.comparison.map((side, i) => <section key={i}><div className="comparison-label"><small>{String(i+1).padStart(2,'0')}</small><span>{side.label || (i ? '后一段' : '前一段')}</span></div><p>{side.text}</p>{side.sourceIndex !== null && <small className="comparison-source">{s.sources[side.sourceIndex]?.label}</small>}</section>)}</div>;
  return <div className={`quote-block ${s.layout === 'note' ? 'note-block' : ''} ${s.text.length > 360 ? 'extra-long' : s.text.length > 100 ? 'long' : ''}`}>
    {s.layout === 'quote' && <span className="quote-mark" aria-hidden="true">“</span>}
    {s.layout === 'note' && <small className="editorial-note">编者概述，非逐字引语</small>}
    <p>{s.text}</p>
  </div>;
}
export function ShortCard({ artifact: a, index, saved, onRead, onSave, onShare, onImage }: CardProps) {
  const s = a.short;
  if (!s) return null;
  const source = s.sources[0];
  const hasMedia = !!coverUrl(a);
  return <div className={`slice-entry layout-${s.layout} ${source || (hasMedia && s.layout !== 'image') ? 'has-evidence' : ''}`}>
    <div className="entry-kicker slice-kicker"><span className="format-badge">{shortLayoutLabels[s.layout]}</span>{a.category && <span>{a.category}</span>}<small>S / {String(index+1).padStart(3,'0')}</small></div>
    <div className="slice-stage"><div className="slice-main">
      {s.layout === 'image' ? <figure className="slice-image"><button onClick={onImage} aria-label="查看完整图片"><ArtifactImage artifact={a} eager={index<2} /></button><figcaption>{s.text || a.title}</figcaption></figure> : <ShortText short={s} />}
      {(s.attribution || a.eventDate) && <div className="slice-attribution">{s.attribution && <span>{s.attribution}</span>}{a.eventDate && <time>{formatDate(a.eventDate)}</time>}</div>}
      {s.context && <div className="slice-context"><small>一句背景</small><p>{s.context}</p></div>}
      <div className="entry-actions"><button className="pill-button" onClick={onRead}>看材料与背景<ArrowUpRight className="ico" /></button><IconButton icon={Bookmark} label={saved ? '取消收藏' : '收藏条目'} aria-pressed={saved} onClick={onSave} /><IconButton icon={Share2} label="分享条目" onClick={onShare} /></div>
    </div>
    {(source || (hasMedia && s.layout !== 'image')) && <aside className="evidence-peek"><div className="evidence-heading"><span>把这句话，放回原处。</span><FileText className="ico" /></div><button className="evidence-paper" onClick={onRead}><small>SOURCE / 01</small>{hasMedia && s.layout !== 'image' ? <ArtifactImage artifact={a} /> : <><h2>{source?.label}</h2>{source?.date && <time>{source.date}</time>}<p>{source?.excerpt ? source.excerpt.slice(0,280)+(source.excerpt.length>280?'…':'') : '打开材料，查看来源。'}</p></>}<span className="evidence-link">查看材料 <ArrowUpRight className="ico" /></span></button></aside>}
    </div>
    <div className="slice-bottom"><span>{a.tags.slice(0,3).map(tag=>`# ${tag}`).join('   ')}</span><span className={`verification ${s.verification}`}>{verificationLabels[s.verification]}</span></div>
  </div>;
}
