import { useAdmin } from './AdminApp';
import { useEffect, useState } from 'react';
import type { FeedDefinition, FeedSettings } from '../../../shared/types';
import { feedSettingsSchema } from '../../../shared/feeds';
import { api, jsonBody, messageOf } from '../api';
import { useApp } from '../context';
import { useResource } from '../hooks/useResource';
import { ErrorNotice, Loading } from '../components/UI';
export function FeedSettingsPanel() {
  const {setDirty}=useAdmin();
  const resource=useResource<FeedSettings>('/admin/feeds');
  const {toast,reloadConfig}=useApp();
  const [value,setValue]=useState<FeedSettings|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{if(resource.data)setValue(resource.data);},[resource.data]);
  useEffect(()=>{setDirty(!!value && !!resource.data && JSON.stringify(value)!==JSON.stringify(resource.data));},[value,resource.data,setDirty]);
  useEffect(()=>()=>setDirty(false),[setDirty]);
  function update(i:number,patch:Partial<FeedDefinition>){setValue(v=>v&&({...v,feeds:v.feeds.map((f,n)=>n===i?{...f,...patch}:f)}));}
  async function save(){if(!value||busy)return;setError('');const checked=feedSettingsSchema.safeParse(value);if(!checked.success){setError(checked.error.issues.map(i=>i.message).join('; '));return;}setBusy(true);try{const result=await api<FeedSettings>('/admin/feeds',{method:'PUT',body:jsonBody(checked.data)});setValue(result);resource.setData(result);reloadConfig();toast('信息流设置已保存。');}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
  return <section className="admin-panel feed-settings-panel"><h2>信息流与混排</h2><p className="section-description">同时勾选长文与切片即可混排。条目还需在编辑器中勾选投放到此流。设置保存在数据库，不需重启。</p>
    {resource.loading?<Loading/>:resource.error?<ErrorNotice message={resource.error} retry={resource.reload}/>:value&&<><fieldset disabled={busy} className="feed-settings-fields">{value.feeds.map((f,i)=><div className="feed-setting-row" key={i}><label>ID<input value={f.id} maxLength={32} onChange={e=>update(i,{id:e.target.value})}/></label><label>名称<input value={f.label} maxLength={30} onChange={e=>update(i,{label:e.target.value})}/></label><label className="feed-description-field">说明<input value={f.description} maxLength={160} onChange={e=>update(i,{description:e.target.value})}/></label><div className="feed-setting-options">{(['long','short'] as const).map(format=><label key={format}><input type="checkbox" checked={f.formats.includes(format)} onChange={e=>update(i,{formats:e.target.checked?[...f.formats,format]:f.formats.filter(t=>t!==format)})}/>{format==='long'?'长文':'切片'}</label>)}<label><input type="checkbox" checked={f.enabled} onChange={e=>update(i,{enabled:e.target.checked})}/>启用</label><a href={`/f/${encodeURIComponent(f.id)}`} target="_blank" rel="noopener noreferrer">预览 ↗</a></div></div>)}<div className="feed-settings-actions"><button type="button" className="secondary-button" disabled={value.feeds.length>=12} onClick={()=>{let n=value.feeds.length+1;while(value.feeds.some(f=>f.id===`stream-${n}`))n++;setValue({...value,feeds:[...value.feeds,{id:`stream-${n}`,label:'新信息流',description:'',formats:['long','short'],enabled:true}]});}}>+ 新增信息流</button><label>默认首页<select value={value.defaultFeed} onChange={e=>setValue({...value,defaultFeed:e.target.value})}>{value.feeds.filter(f=>f.enabled).map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label><button className="admin-primary" type="button" onClick={()=>{void save();}}>{busy?'保存中…':'保存信息流设置'}</button></div></fieldset><p className="field-hint">修改 ID 不会自动迁移旧条目的投放关系。临时不用的流请取消“启用”，日后可恢复。</p></>}{error&&<ErrorNotice message={error} retry={resource.reload}/>}</section>;
}
