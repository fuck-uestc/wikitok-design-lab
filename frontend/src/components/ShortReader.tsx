import { useState } from 'react';
import type { Artifact } from '../../../shared/types';
import { shortLayoutLabels, verificationLabels } from '../../../shared/feeds';
import { ShortText } from './ShortCard';
import { ArtifactImage } from './ArticleCards';
import { ExternalLink, Markdown } from './UI';
import { coverUrl, mediaUrl } from '../api';
export function ShortReader({ article: a }: { article: Artifact }) {
  const [tab, setTab] = useState<'sources'|'context'|'correction'>('sources');
  const s=a.short!;
  return <div className="short-reader"><div className="reader-kicker">{shortLayoutLabels[s.layout]} <span className={`verification ${s.verification}`}>{verificationLabels[s.verification]}</span></div><h1 className="short-reader-title">{a.title}</h1>
    {s.layout==='image'&&coverUrl(a)?<><a href={coverUrl(a)} target="_blank" rel="noopener noreferrer"><ArtifactImage artifact={a} className="source-image" eager /></a>{s.text&&<p>{s.text}</p>}</>:<ShortText short={s}/>}
    {s.attribution&&<p className="slice-attribution">{s.attribution}</p>}{s.context&&<p className="short-context-full">{s.context}</p>}
    <div className="material-tabs" role="tablist" aria-label="材料与背景">{([['sources','留档材料'],['context','必要背景'],['correction','更正说明']] as const).map(([key,label])=><button key={key} role="tab" id={`material-tab-${key}`} aria-controls={`material-panel-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} onKeyDown={event=>{const keys=['sources','context','correction'] as const;let index=keys.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%3;else if(event.key==='ArrowLeft')index=(index+2)%3;else if(event.key==='Home')index=0;else if(event.key==='End')index=2;else return;event.preventDefault();setTab(keys[index]);document.getElementById(`material-tab-${keys[index]}`)?.focus();}} onClick={()=>setTab(key)}>{label}{key==='sources'&&s.sources.length>0&&<small>{s.sources.length}</small>}</button>)}</div>
    <section role="tabpanel" id={`material-panel-${tab}`} aria-labelledby={`material-tab-${tab}`} className="material-panel">
      {tab==='sources'&&<>{s.sources.map((source,i)=><article className="source-record" key={i}><small>SOURCE / {String(i+1).padStart(2,'0')}</small><h2>{source.label}</h2>{source.date&&<time>{source.date}</time>}{source.excerpt&&<p className="source-excerpt">{source.excerpt}</p>}{source.mediaId&&(()=>{const file=a.attachments.find(f=>f.id===source.mediaId);return file?<a className="source-file" href={mediaUrl(file.url)} target="_blank" rel="noopener noreferrer">{file.mimeType.startsWith('image/')&&<img src={mediaUrl(file.url)} alt={file.originalName} loading="lazy"/>}<span>{file.originalName} ↗</span></a>:<p>材料暂不可用</p>;})()}{source.url&&<ExternalLink href={source.url}>打开原始来源</ExternalLink>}</article>)}{a.sourceUrl&&<ExternalLink href={a.sourceUrl}>{a.sourceTitle||'查看原帖'}</ExternalLink>}{!s.sources.length&&!a.sourceUrl&&<p className="material-empty">尚未附上来源材料。请结合核对状态阅读。</p>}</>}
      {tab==='context'&&(a.content?<Markdown content={a.content}/>:<p>{s.context||'暂无补充背景。'}</p>)}
      {tab==='correction'&&<p className="source-excerpt">{s.correction||'暂无公开更正说明。'}</p>}
    </section>
  </div>;
}
