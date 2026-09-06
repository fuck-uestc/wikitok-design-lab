
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactSchema } from '../shared/schema.js';
import { defaultFeeds } from '../shared/feeds.js';
import { Store, toInput } from '../backend/src/store.js';
import { loadConfig } from '../backend/src/config.js';
import { migrations } from '../backend/src/migrations.js';
import { fixture, record, jsonImport, filesBody, password } from './helpers.js';

const slice = (title: string, extra: Record<string, unknown> = {}) => ({title, format:'short', short:{layout:'quote',text:'A fictional quotation. Not a real allegation.',context:'Fictional test material.'}, ...extra});
const writeToken='write-test-token-'+ 'x'.repeat(40);
const readToken='read-test-token-'+ 'y'.repeat(40);
async function rpc(base: string, token: string, name: string, args: unknown = {}) {
  const response=await fetch(base+'/mcp',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  assert.equal(response.status,200);
  return (await response.json() as any).result;
}

test('legacy v1 migration preserves identities, tags, revisions and publication', () => {
  const directory=mkdtempSync(join(tmpdir(),'wiki-v1-migration-'));
  let store: Store | undefined;
  try {
    const config=loadConfig({DATABASE_PATH:join(directory,'wiki.sqlite'),UPLOAD_DIR:join(directory,'uploads')});
    const db=new DatabaseSync(config.databasePath);
    db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)");
    db.exec(migrations[0].sql);db.prepare('INSERT INTO schema_migrations VALUES(1,?)').run('2026-01-01');
    db.prepare("INSERT INTO artifacts(id,slug,title,summary,content,kind,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,'article','published',?,?,?)").run('legacy-id','legacy-slug','Legacy article','Summary','Original content','2026-01-01','2026-01-01','2026-01-01');
    db.exec("INSERT INTO tags(id,name) VALUES(1,'legacy-tag'); INSERT INTO artifact_tags VALUES('legacy-id',1)");
    db.prepare('INSERT INTO revisions(artifact_id,version,action,actor,snapshot,created_at) VALUES(?,1,?,?,?,?)').run('legacy-id','create','test',JSON.stringify(record('Legacy article',{slug:'legacy-slug',status:'published'})),'2026-01-01');db.close();
    store=new Store(config);const a=store.get('legacy-id')!;
    assert.equal(a.slug,'legacy-slug');assert.equal(a.content,'Original content');assert.equal(a.format,'long');assert.equal(a.short,null);assert.deepEqual(a.feedIds,['main','wiki']);assert.deepEqual(a.tags,['legacy-tag']);assert.equal(a.version,1);assert.equal(store.revisions(a.id).length,1);assert.equal(store.list({feed:'main',limit:10}).total,1);
    const restored=store.save(artifactSchema.parse(store.revisions(a.id)[0].snapshot),'test',a.id,1,'restore');assert.equal(restored.version,2);assert.equal(restored.format,'long');
    store.close();store=undefined;store=new Store(config);assert.equal(store.get('legacy-id')!.version,2);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM schema_migrations').get()!.n,2);
  } finally {store?.close();rmSync(directory,{recursive:true,force:true});}
});

test('mixed and separate streams intersect publication, placement and allowed formats', async t => {
  const f=await fixture(t);
  const long=f.store.save(artifactSchema.parse(record('Full article',{status:'published'})),'test');
  const short=f.store.save(artifactSchema.parse(slice('Slice',{status:'published'})),'test');
  const outside=f.store.save(artifactSchema.parse(slice('No placement',{status:'published',feedIds:[]})),'test');
  f.store.save(artifactSchema.parse(slice('Wrong format',{status:'published',feedIds:['wiki']})),'test');
  f.store.save(artifactSchema.parse(slice('Draft')),'test');
  const read=async(query:string)=>(await f.publicClient.request('/api/artifacts?'+query)).data;
  assert.deepEqual(new Set((await read('feed=main')).items.map((a:any)=>a.id)),new Set([long.id,short.id]));
  assert.equal((await read('feed=wiki')).items[0].format,'long');assert.equal((await read('feed=wiki')).total,1);
  assert.equal((await read('feed=slices')).total,1);assert.equal((await read('feed=main&format=short')).items[0].id,short.id);
  assert.equal((await read('feed=wiki&format=short')).total,0);assert.equal((await read('')).total,4);
  assert.equal((await f.publicClient.request('/api/artifacts/'+outside.slug)).data.id,outside.id);
  await f.publicClient.request('/api/artifacts?feed=unknown',{expected:404});await f.publicClient.request('/api/artifacts?format=invalid',{expected:400});
});

test('search, random and taxonomy share the selected stream and format', async t => {
  const f=await fixture(t);
  f.store.save(artifactSchema.parse(record('Long search',{status:'published',category:'LongTopic'})),'test');
  const short=f.store.save(artifactSchema.parse(slice('Short search',{status:'published',category:'ShortTopic',short:{layout:'quote',text:'SpecialToken',context:'contextneedle',sources:[{label:'Source',excerpt:'EvidenceNeedle'}]}})),'test');
  f.store.save(artifactSchema.parse(slice('Not distributed',{status:'published',feedIds:[],category:'OutsideTopic'})),'test');
  assert.equal((await f.publicClient.request('/api/artifacts?feed=main&format=short&q=EvidenceNeedle')).data.items[0].id,short.id);
  assert.equal((await f.publicClient.request('/api/artifacts?feed=wiki&q=SpecialToken')).data.total,0);
  assert.deepEqual((await f.publicClient.request('/api/taxonomy?feed=main&format=short')).data.categories,[{name:'ShortTopic',count:1}]);
  for(let i=0;i<5;i++) assert.equal((await f.publicClient.request('/api/artifacts/random?feed=main&format=short')).data.id,short.id);
  await f.publicClient.request('/api/artifacts/random?feed=wiki&format=short',{expected:404});
});

test('cursor pagination stays scoped, unique and stable when mixing formats', async t => {
  const f=await fixture(t);
  for(let i=0;i<28;i++)f.store.save(artifactSchema.parse(i%2?slice('Slice '+i,{status:'published'}):record('Long '+i,{status:'published'})),'test');
  const first=(await f.publicClient.request('/api/artifacts?feed=main&limit=5')).data;assert.equal(first.total,28);
  await f.publicClient.request('/api/artifacts?feed=slices&cursor='+first.nextCursor,{expected:400});
  await f.publicClient.request('/api/artifacts?feed=main&format=short&cursor='+first.nextCursor,{expected:400});
  let cursor=first.nextCursor;const ids=first.items.map((a:any)=>a.id);
  while(cursor){const page:any=(await f.publicClient.request('/api/artifacts?feed=main&limit=5&cursor='+cursor)).data;ids.push(...page.items.map((a:any)=>a.id));assert.equal(page.total,28);cursor=page.nextCursor;}
  assert.equal(ids.length,28);assert.equal(new Set(ids).size,28);
  const settings=f.store.feedSettings();f.store.saveFeedSettings({...settings,feeds:settings.feeds.map(feed=>feed.id==='main'?{...feed,formats:['long']}:feed)},'test');
  await f.publicClient.request('/api/artifacts?feed=main&cursor='+first.nextCursor,{expected:400});
});

test('feed configuration is versioned, persistent and does not expose disabled feeds', async t => {
  const f=await fixture(t);const settings=(await f.admin.request('/api/admin/feeds')).data;
  const management=(await f.admin.request('/api/admin/settings')).data;
  assert.equal(management.mcp.endpoint,'http://localhost:5173/mcp'); assert.ok(!JSON.stringify(management).includes(password));
  await f.publicClient.request('/api/admin/feeds',{expected:401});
  await f.admin.request('/api/admin/feeds',{method:'PUT',csrf:false,body:settings,expected:403});
  const body={...settings,defaultFeed:'slices',feeds:settings.feeds.map((feed:any)=>feed.id==='wiki'?{...feed,enabled:false}:feed)};
  const saved=(await f.admin.request('/api/admin/feeds',{method:'PUT',body})).data;assert.equal(saved.version,2);
  await f.admin.request('/api/admin/feeds',{method:'PUT',body,expected:409});
  const publicConfig=(await f.publicClient.request('/api/config')).data;assert.equal(publicConfig.defaultFeed,'slices');assert.ok(!publicConfig.feeds.some((a:any)=>a.id==='wiki'));
  await f.publicClient.request('/api/artifacts?feed=wiki',{expected:404});
  const again=new Store(f.config);assert.equal(again.feedSettings().version,2);again.close();
  await f.admin.request('/api/admin/feeds',{method:'PUT',body:{...saved,defaultFeed:'wiki'},expected:400});
  await f.admin.request('/api/admin/feeds',{method:'PUT',body:{...saved,feeds:[...saved.feeds,saved.feeds[0]]},expected:400});
});

test('short validation separates quotes, images, notes and sourced comparisons', async t => {
  const f=await fixture(t);
  for (const payload of [slice('Missing text',{short:{layout:'quote'}}),slice('Missing image',{short:{layout:'image'}}),slice('One side',{short:{layout:'comparison',comparison:[{text:'one'}]}}),slice('Bad source',{short:{layout:'quote',text:'x',verification:'source-checked'}}),slice('Correction missing',{short:{layout:'note',text:'x',verification:'corrected'}}),slice('Unsafe url',{short:{layout:'quote',text:'x',sources:[{label:'x',url:'javascript:alert(1)'}]}}),slice('Partial verification',{short:{layout:'comparison',verification:'source-checked',sources:[{label:'x',url:'https://example.org'}],comparison:[{text:'a',sourceIndex:0},{text:'b',sourceIndex:null}]}})]) {
    await f.admin.request('/api/admin/artifacts',{method:'POST',body:payload,expected:400});
  }
  const payload=slice('Two sourced sides',{short:{layout:'comparison',verification:'source-checked',sources:[{label:'A',url:'https://example.org/a'},{label:'B',url:'https://example.org/b'}],comparison:[{text:'First source',sourceIndex:0},{text:'Second source',sourceIndex:1}]}});
  const a=(await f.admin.request('/api/admin/artifacts',{method:'POST',body:payload,expected:201})).data;
  assert.equal(a.content,'');assert.equal(a.format,'short');assert.equal(a.short.comparison.length,2);assert.equal(a.status,'draft');
  const updated=f.store.save({...toInput(a),short:{...a.short,comparison:[{text:'UpdatedFirst',label:'A',sourceIndex:0},a.short.comparison[1]]}},'test',a.id,a.version);assert.match(updated.summary,/UpdatedFirst/);
});

test('source media become attachments and follow publication, not feed placement', async t => {
  const f=await fixture(t);
  const uploaded=(await f.admin.request('/api/admin/media',{method:'POST',body:filesBody([{name:'source.txt',content:'Fictional source evidence'}]),expected:201})).data;
  const media=Array.isArray(uploaded)?uploaded[0]:uploaded.items[0];
  const a=f.store.save(artifactSchema.parse(slice('Private source',{feedIds:[],short:{layout:'quote',text:'Fictional source',sources:[{label:'Source',mediaId:media.id}]}})),'test');
  assert.ok(a.attachmentIds.includes(media.id));await f.publicClient.request('/api/media/'+media.id,{expected:404});
  const published=f.store.save({...toInput(a),status:'published'},'test',a.id,a.version);await f.publicClient.request('/api/media/'+media.id);
  f.store.save({...toInput(published),status:'archived'},'test',a.id,published.version);await f.publicClient.request('/api/media/'+media.id,{expected:404});
});

test('JSON and CSV import/export retain short payloads and explicit empty memberships', async t => {
  const f=await fixture(t);const payload=slice('Imported slice',{feedIds:[],short:{layout:'note',text:'Fictional note',sources:[{label:'Source',excerpt:'original'}]}});
  const preview=(await f.admin.request('/api/admin/imports/preview',{method:'POST',body:jsonImport({artifacts:[payload,record('Imported long')]})})).data;
  await f.admin.request(`/api/admin/imports/${preview.id}/commit`,{method:'POST'});
  const exported=(await f.admin.request('/api/admin/export')).data;assert.equal(exported.schemaVersion,2);
  const a=exported.artifacts.find((a:any)=>a.title==='Imported slice');assert.deepEqual(a.feedIds,[]);assert.equal(a.short.sources[0].excerpt,'original');assert.equal(a.format,'short');
  const cell=(s:string)=>'"'+s.replaceAll('"','""')+'"';const csv='title,format,feedIds,short\nCSV slice,short,slices,'+cell(JSON.stringify({layout:'quote',text:'CSV quotation'}))+'\n';
  const plan=(await f.admin.request('/api/admin/imports/preview',{method:'POST',body:filesBody([{name:'slices.csv',content:csv}])})).data;assert.equal(plan.canCommit,true);
  await f.admin.request(`/api/admin/imports/${plan.id}/commit`,{method:'POST'});assert.deepEqual(f.store.get('csv-slice')!.feedIds,['slices']);
});

test('MCP uses dedicated credentials with a read-only scope and stable transport', async t => {
  const f=await fixture(t,{MCP_ALLOW_ADMIN_PASSWORD:'false',MCP_TOKEN:writeToken,MCP_READ_TOKEN:readToken});
  const request=(token:string,body:unknown,headers:Record<string,string>={})=>fetch(f.base+'/mcp',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await request(password,{jsonrpc:'2.0',id:1,method:'initialize'})).status,401);
  assert.equal((await fetch(f.base+'/mcp')).status,405);
  assert.equal((await request(writeToken,{jsonrpc:'2.0',id:1,method:'ping'},{'MCP-Protocol-Version':'invalid'})).status,400);
  assert.equal((await request(writeToken,{jsonrpc:'2.0',id:1,method:'ping'},{origin:'https://evil.example'})).status,403);
  assert.equal((await request(writeToken,{jsonrpc:'2.0',method:'notifications/initialized'})).status,202);
  const listed:any=await (await request(readToken,{jsonrpc:'2.0',id:1,method:'tools/list'})).json();assert.ok(listed.result.tools.every((tool:any)=>tool.annotations.readOnlyHint));assert.ok(!listed.result.tools.some((tool:any)=>tool.name==='artifact_create'));
  assert.equal((await rpc(f.base,readToken,'artifact_create',{artifact:slice('Denied')})).isError,true);
  const full:any=await (await request(writeToken,{jsonrpc:'2.0',id:1,method:'tools/list'})).json();assert.equal(full.result.tools.length,15);assert.ok(full.result.tools.find((a:any)=>a.name==='artifact_create').inputSchema.properties.artifact.properties.short);
  const config=await f.publicClient.request('/api/config');assert.ok(!config.text.includes(writeToken));assert.ok(!config.text.includes(readToken));
});

test('MCP patch preserves unspecified data, enforces versions and restores memberships', async t => {
  const f=await fixture(t,{MCP_TOKEN:writeToken});
  const created=(await rpc(f.base,writeToken,'artifact_create',{artifact:slice('Original',{status:'published',feedIds:['slices']})})).structuredContent;
  const changed=(await rpc(f.base,writeToken,'artifact_patch',{id:created.slug,version:1,patch:{title:'Patched title'}})).structuredContent;
  assert.equal(changed.id,created.id);assert.equal(changed.format,'short');assert.equal(changed.status,'published');assert.deepEqual(changed.short,created.short);assert.deepEqual(changed.feedIds,['slices']);assert.equal(changed.slug,created.slug);
  assert.equal((await rpc(f.base,writeToken,'artifact_patch',{id:created.id,version:1,patch:{title:'Stale'}})).isError,true);
  const excluded=(await rpc(f.base,writeToken,'artifact_patch',{id:created.id,version:2,patch:{feedIds:[]}})).structuredContent;assert.deepEqual(excluded.feedIds,[]);assert.equal(f.store.list({feed:'slices',limit:10}).total,0);
  const restored=(await rpc(f.base,writeToken,'artifact_restore',{id:created.id,version:3,revision:1})).structuredContent;assert.deepEqual(restored.feedIds,['slices']);assert.equal(restored.short.text,created.short.text);
  assert.equal((await rpc(f.base,writeToken,'feed_preview',{feed:'slices'})).structuredContent.total,1);
});

test('MCP batches and feed updates reuse REST validation and optimistic concurrency', async t => {
  const f=await fixture(t,{MCP_TOKEN:writeToken});
  const plan=(await rpc(f.base,writeToken,'artifact_import_preview',{artifacts:[slice('Batch slice'),record('Batch long')]})).structuredContent;assert.ok(plan.canCommit);assert.equal(f.store.stats().draft,0);
  const result=await rpc(f.base,writeToken,'artifact_import_commit',{previewId:plan.id});assert.ok(!result.isError);assert.equal(f.store.stats().draft,2);
  assert.equal((await rpc(f.base,writeToken,'artifact_import_commit',{previewId:plan.id})).isError,true);
  const settings=(await rpc(f.base,writeToken,'feed_list')).structuredContent;const saved=(await rpc(f.base,writeToken,'feed_configure',{...settings,defaultFeed:'slices'})).structuredContent;assert.equal(saved.version,2);
  assert.equal((await rpc(f.base,writeToken,'feed_configure',settings)).isError,true);
  const file=(await rpc(f.base,writeToken,'media_upload',{filename:'evidence.txt',base64:Buffer.from('Fictional test evidence').toString('base64')})).structuredContent;assert.equal(file.items[0].mimeType,'text/plain');
  assert.equal((await rpc(f.base,writeToken,'media_upload',{filename:'fake.png',base64:Buffer.from('not a PNG').toString('base64')})).isError,true);
});

test('feed and MCP environment settings reject insecure or inconsistent values', () => {
  assert.throws(()=>loadConfig({MCP_TOKEN:'short'}));assert.throws(()=>loadConfig({MCP_TOKEN:writeToken,MCP_READ_TOKEN:writeToken}));assert.throws(()=>loadConfig({FEEDS_JSON:'[]'}));
  assert.throws(()=>loadConfig({FEEDS_JSON:JSON.stringify(defaultFeeds),DEFAULT_FEED:'missing'}));
  const config=loadConfig({FEEDS_JSON:JSON.stringify(defaultFeeds),DEFAULT_FEED:'slices',MCP_TOKEN:writeToken});assert.equal(config.site.defaultFeed,'slices');assert.equal(config.mcpAllowAdminPassword,false);
});
