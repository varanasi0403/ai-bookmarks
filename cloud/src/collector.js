import { XMLParser } from 'fast-xml-parser';
import { sources, topics, keywords } from './catalog.js';
const LEASE_MS=60_000;
const MANUAL_COOLDOWN_MS=60_000;
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,processEntities:false,
  stopNodes:['*.content','*.description','*.summary','*.encoded']});
const list=x=>Array.isArray(x)?x:x?[x]:[];
const value=x=>typeof x==='object'?x?.['#text']||'':String(x??'');
export function clean(text){
 return value(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[e])
  .replace(/&#(x[\da-f]+|\d+);/gi,(m,n)=>{const p=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return p>0&&p<=0x10ffff?String.fromCodePoint(p):'';}).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
export function canonical(raw){
 try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;
 u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';
 for(const key of [...u.searchParams.keys()])if(key.startsWith('utm_')||['ref','fbclid'].includes(key))u.searchParams.delete(key);
 // Match Python's urlencode normalization used for existing article IDs.
 u.search=u.searchParams.toString();return u.href;
 }catch{return null;}
}
export function classify(title,excerpt,source){
 const text=(title+' '+excerpt).toLowerCase();
 const relevant=source.name.endsWith('releases')||/\b(models?|llms?|weights|training|fine.tun\w*|inference|rag|agents?|mcp|sdk|api|library|libraries|framework|pytorch|transformers|vllm|codex|developers?|architecture|distributed|latency|retrieval|embeddings?|gpus?|kubernetes|datasets?|machine learning|deep learning|reinforcement learning|vector)\b/.test(text);
 if(!relevant||source.name.startsWith('Oracle')&&!/\b(ai|llm|agents?|machine learning|vector|training|inference|gpus?|mcp)\b/.test(text))return null;
 const hits=topics.map(topic=>keywords[topic].reduce((n,w)=>n+Number(text.includes(w)),0));
 const max=Math.max(...hits);const topic=source.topic==='Oracle & OCI'?source.topic:max?topics[hits.indexOf(max)]:source.topic;
 return{topic,score:Math.min(98,60+hits[topics.indexOf(topic)]*7)};
}
export async function parseFeed(xml,source,now=new Date()){
 // Parse only the newest ten complete entries, bounding CPU per free Worker invocation.
 // The scheduled source rotation repeats every 18 minutes, rather than once per day.
 const chunks=[];
 for(const match of xml.matchAll(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)){chunks.push(match);if(chunks.length===10)break;}
 if(!chunks.length)throw Error('Feed returned no entries');
 const result=[];
 for(const match of chunks){
  const parsed=parser.parse(match[0]);const item=parsed.item||parsed.entry;
  const links=list(item.link),link=links.find(l=>typeof l==='object'&&(!l['@_rel']||l['@_rel']==='alternate'))||links[0];
  const url=canonical(typeof link==='object'?link['@_href']:clean(link));if(!url)continue;
  const rawDate=value(item.pubDate||item.published||item.updated||item.date);const date=new Date(rawDate);
  const published=Number.isNaN(date.getTime())?null:date.toISOString();
  if(published&&(date<new Date(now-30*86400000)||date>new Date(+now+86400000)))continue;
  const title=clean(item.title||'Untitled').slice(0,500);
  const excerpt=clean(item.description||item.summary||item.content||item.encoded||'').slice(0,1500);
  const classification=classify(title,excerpt,source);if(!classification)continue;
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));
  const id=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('').slice(0,20);
  result.push({id,title,url,source:source.name,published,fetched:now.toISOString(),excerpt,...classification});
 }
 return result;
}
async function boundedText(response){
 if(!response.ok)throw Error('Publisher returned HTTP '+response.status);
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>2*1024*1024)throw Error('Feed exceeds size limit');text+=decoder.decode(value,{stream:true});
  if((text.match(/<\/(?:item|entry)\s*>/gi)||[]).length>=10)break;
 }return text+decoder.decode();}finally{await reader.cancel();}
}
export async function collectSource(env,index,trigger='manual',fetcher=fetch,now=new Date()){
 const source=sources[index];if(!source)throw Error('Unknown source');
 const stamp=now.toISOString();
 const leaseExpires=new Date(+now+LEASE_MS).toISOString();
 // A scheduled check releases its lease on completion so the Sync button can fetch again.
 const nextManualCheck=trigger==='manual'?new Date(+now+MANUAL_COOLDOWN_MS).toISOString():stamp;
 const claim=await env.DB.prepare("INSERT INTO source_checks(name,next_attempt) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET next_attempt=excluded.next_attempt WHERE source_checks.next_attempt<=? RETURNING name")
  .bind(source.name,leaseExpires,stamp).first();
 if(!claim)return{name:source.name,skipped:true};
 try{
  const response=await fetcher(source.url,{headers:{'User-Agent':'AI-BookMarks-RSS/2.0'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  const articles=await parseFeed(await boundedText(response),source,now);
  const writes=articles.map(a=>env.DB.prepare('INSERT OR IGNORE INTO articles(id,title,url,source,published,fetched,excerpt,topic,score) VALUES (?,?,?,?,?,?,?,?,?)')
   .bind(a.id,a.title,a.url,a.source,a.published,a.fetched,a.excerpt,a.topic,a.score));
  writes.push(env.DB.prepare('UPDATE source_checks SET checked=?,last_success=?,ok=1,items=?,error=NULL,trigger=?,next_attempt=? WHERE name=? AND next_attempt=?')
   .bind(stamp,stamp,articles.length,trigger,nextManualCheck,source.name,leaseExpires));
  const results=await env.DB.batch(writes);
  const added=results.slice(0,articles.length).reduce((total,result)=>total+result.meta.changes,0);
  return{name:source.name,ok:true,items:articles.length,added,checked:stamp};
 }catch(error){
  await env.DB.prepare('UPDATE source_checks SET checked=?,ok=0,error=?,trigger=?,next_attempt=? WHERE name=? AND next_attempt=?')
   .bind(stamp,'Source unavailable; keeping previous articles.',trigger,nextManualCheck,source.name,leaseExpires).run();
  console.error('RSS source failed:',source.name,error?.message);
  return{name:source.name,ok:false,checked:stamp};
 }
}
export async function collectionStatus(env){
 const row=await env.DB.prepare('SELECT value FROM metadata WHERE key=?').bind('collection').first();
 const baseline=row?JSON.parse(row.value):{last_refresh:null,sources:[]};
 const all=await env.DB.prepare('SELECT name,checked,last_success,ok,items,error,trigger FROM source_checks').all();
 const results=all.results.filter(r=>sources.some(s=>s.name===r.name));
 const scheduler=await env.DB.prepare('SELECT value FROM metadata WHERE key=?').bind('scheduler').first();
 const lastScheduled=scheduler?JSON.parse(scheduler.value):null;
 const known=new Map(baseline.sources.map(s=>[s.name,s]));
 for(const r of results)if(r.checked)known.set(r.name,{...r,ok:Boolean(r.ok)});
 const successful=results.filter(r=>r.last_success).map(r=>r.last_success).sort();
 return{hosted:true,last_refresh:successful.at(-1)||baseline.last_refresh,refresh:{running:false},refresh_error:null,
  collection_mode:'cloudflare',collection_interval_minutes:2*sources.length,refresh_cooldown_minutes:MANUAL_COOLDOWN_MS/60_000,
  scheduler_last_run:lastScheduled?.completed||null,scheduler_last_result:lastScheduled?.result||null,
  sources:sources.map((s,i)=>({...s,index:i,...(known.get(s.name)||{ok:false,checked:null}),enabled:true})),topics,
  preferences:{topics,sources:sources.map(s=>s.name),refresh_hours:1}};
}
export async function scheduledCollection(event,env,fetcher=fetch){
 // One source per event keeps parsing and DB writes inside a Free-plan request budget.
 const index=Math.floor(event.scheduledTime/120000)%sources.length;
 const result=await collectSource(env,index,'scheduled',fetcher);
 await env.DB.prepare('INSERT INTO metadata(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('scheduler',JSON.stringify({scheduled:new Date(event.scheduledTime).toISOString(),completed:new Date().toISOString(),result})).run();
 console.log('Scheduled RSS check',JSON.stringify(result));return result;
}
