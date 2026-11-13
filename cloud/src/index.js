import { sources, topics } from './catalog.js';

const MAX_ROWS = 5000;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};
const json = (value, status=200, extra={}) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type':'application/json; charset=utf-8', ...securityHeaders, ...extra},
});

export function authorized(request, token) {
  if (!token || token.length < 32) return false;
  const actual = request.headers.get('authorization') || '';
  const expected = `Bearer ${token}`;
  let mismatch = actual.length ^ expected.length;
  for (let i=0;i<expected.length;i++) mismatch |= (actual.charCodeAt(i)||0) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

export function validArticle(value) {
  if (!value || !/^[a-f0-9]{20}$/.test(value.id || '')) return false;
  if (!sources.some(s=>s.name===value.source) || !topics.includes(value.topic)) return false;
  for (const key of ['title','url','fetched','excerpt']) if(typeof value[key]!=='string') return false;
  if (!value.title || value.title.length>1000 || value.url.length>4000 || value.excerpt.length>12000) return false;
  if (!Number.isInteger(value.score) || value.score<0 || value.score>100) return false;
  if (!Number.isFinite(Date.parse(value.fetched))) return false;
  if (value.published!=null && !Number.isFinite(Date.parse(value.published))) return false;
  try {const u=new URL(value.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}
  catch {return false;}
}

async function readMetadata(env) {
  const row=await env.DB.prepare('SELECT value FROM metadata WHERE key=?').bind('collection').first();
  return row ? JSON.parse(row.value) : {last_refresh:null,sources:[]};
}

export async function ingest(request, env) {
  if(!authorized(request,env.INGEST_TOKEN)) return json({detail:'Unauthorized'},401);
  if(Number(request.headers.get('content-length')||0)>300000) return json({detail:'Batch too large'},413);
  const raw=await request.text();
  if(raw.length>300000) return json({detail:'Batch too large'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({detail:'Invalid JSON'},400);}
  if(!Array.isArray(body.articles)||body.articles.length>20||!body.articles.every(validArticle)) return json({detail:'Invalid article batch'},400);
  if(body.collection) {
    if(!Number.isFinite(Date.parse(body.collection.last_refresh))||!Array.isArray(body.collection.sources)||body.collection.sources.length>sources.length) return json({detail:'Invalid collection metadata'},400);
    for(const s of body.collection.sources) if(!sources.some(known=>known.name===s.name)||typeof s.ok!=='boolean') return json({detail:'Unknown source status'},400);
  }
  const statements=body.articles.map(a=>env.DB.prepare('INSERT OR IGNORE INTO articles (id,title,url,source,published,fetched,excerpt,topic,score) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(a.id,a.title,a.url,a.source,a.published||null,a.fetched,a.excerpt,a.topic,a.score));
  if(body.collection) statements.push(env.DB.prepare('INSERT OR REPLACE INTO metadata (key,value) VALUES (?,?)').bind('collection',JSON.stringify(body.collection)));
  if(statements.length) await env.DB.batch(statements);
  return json({ok:true,accepted:body.articles.length});
}

export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url);
    try {
      if(url.pathname==='/api/admin/ingest' && request.method==='POST') return await ingest(request,env);
      if(url.pathname==='/api/admin/status') {
        if(!authorized(request,env.INGEST_TOKEN)) return json({detail:'Unauthorized'},401);
        return json({...await readMetadata(env),total:(await env.DB.prepare('SELECT COUNT(*) AS total FROM articles').first()).total});
      }
      if(request.method!=='GET'&&request.method!=='HEAD') return json({detail:'This shared feed is read-only; preferences are saved in your browser.'},405);
      if(url.pathname==='/health') return json({ok:true,service:'AI Updates RSS'});
      if(url.pathname==='/api/status'||url.pathname==='/api/articles') {
        const cacheKey=new Request(url.origin+url.pathname);
        const cache=globalThis.caches?.default;
        const cached=cache?await cache.match(cacheKey):null;
        if(cached) return cached;
        let response;
        if(url.pathname==='/api/articles') {
          const {results}=await env.DB.prepare('SELECT id,title,url,source,published,fetched,excerpt,topic,score FROM articles ORDER BY COALESCE(published,fetched) DESC LIMIT ?').bind(MAX_ROWS).all();
          response=json(results.map(a=>({...a,saved:0,seen:0})),200,{'Cache-Control':'public, max-age=60, s-maxage=300'});
        } else {
          const state=await readMetadata(env);
          const byName=new Map(state.sources.map(s=>[s.name,s]));
          response=json({hosted:true,last_refresh:state.last_refresh,refresh:{running:false},refresh_error:null,
            sources:sources.map(s=>({...s,...(byName.get(s.name)||{ok:false,checked:null}),enabled:true})),
            topics,preferences:{topics,sources:sources.map(s=>s.name),refresh_hours:24}},200,{'Cache-Control':'public, max-age=60, s-maxage=300'});
        }
        if(cache&&ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey,response.clone()));
        return response;
      }
      if(url.pathname.startsWith('/api/')) return json({detail:'Not found'},404);
      const asset=await env.ASSETS.fetch(request);
      const response=new Response(asset.body,asset);
      for(const [key,value] of Object.entries(securityHeaders)) response.headers.set(key,value);
      return response;
    } catch(error) {
      console.error('Request failed:',error?.name||'Error');
      return json({detail:'The feed is temporarily unavailable. Please retry shortly.'},503);
    }
  }
};
