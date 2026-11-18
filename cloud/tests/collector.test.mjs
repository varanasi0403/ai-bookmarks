import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,parseFeed,collectSource,scheduledCollection} from '../src/collector.js';
import {sources} from '../src/catalog.js';
import worker from '../src/index.js';
const now=new Date('2026-11-14T06:30:00Z');
const rss='<rss><channel><item><title>New AI model &amp; training API</title><link>https://example.com/post/?utm_source=news&amp;ref=feed</link><description><![CDATA[<p>Model weights for inference and training.</p>]]></description><pubDate>Sat, 14 Nov 2026 06:00:00 GMT</pubDate></item></channel></rss>';
test('RSS HTML excerpts, canonical URLs and stable IDs match existing history',async()=>{
 const [a]=await parseFeed(rss,sources[0],now);
 assert.equal(a.url,'https://example.com/post');assert.equal(a.title,'New AI model & training API');
 assert.equal(a.excerpt,'Model weights for inference and training.');assert.match(a.id,/^[a-f0-9]{20}$/);
 assert.equal(a.id,(await parseFeed(rss,sources[0],now))[0].id);
});
test('Atom alternate links and CDATA content are supported',async()=>{
 const [a]=await parseFeed('<feed><entry><title>SDK release</title><link rel="self" href="https://example.com/api"/><link rel="alternate" href="https://example.com/release"/><updated>2026-11-14T05:00:00Z</updated><content type="html">&lt;p&gt;AI inference SDK&lt;/p&gt;</content></entry></feed>',sources[0],now);
 assert.equal(a.url,'https://example.com/release');assert.equal(a.excerpt,'AI inference SDK');
});
test('unsafe URLs, old entries and unrelated announcements are excluded',async()=>{
 assert.equal(canonical('javascript:alert(1)'),null);assert.equal(canonical('https://user:password@example.com'),null);
 assert.deepEqual(await parseFeed(rss.replace('https://example.com/post/','javascript:alert(1)'),sources[0],now),[]);
 assert.deepEqual(await parseFeed(rss.replace('14 Nov 2026','14 Oct 2026'),sources[0],now),[]);
 await assert.rejects(()=>parseFeed('<html>Not a feed</html>',sources[0],now));
});
function database(claim=true,articleChanges=1){const writes=[];return{writes,prepare(sql){return{bind(...values){return{async first(){return claim?{name:'OpenAI'}:null;},async run(){writes.push({sql,values});}}}}},async batch(statements){writes.push(...statements);return statements.map((_,i)=>({meta:{changes:i===statements.length-1?1:articleChanges}}));}};}
test('shared cooldown skips network collection for repeated clicks',async()=>{
 const result=await collectSource({DB:database(false)},0,'manual',()=>{throw Error('Network should not run');},now);
 assert.equal(result.skipped,true);
});
test('successful collection persists articles and records the actual trigger',async()=>{
 const db=database();const result=await collectSource({DB:db},0,'scheduled',async url=>{assert.equal(url,sources[0].url);return new Response(rss);},now);
 assert.equal(result.ok,true);assert.equal(result.items,1);assert.equal(result.added,1);assert.equal(db.writes.length,2);
});
test('publisher failures preserve history and report an unavailable source',async()=>{
 const db=database();const result=await collectSource({DB:db},0,'manual',async()=>new Response('Busy',{status:503}),now);
 assert.equal(result.ok,false);assert.equal(db.writes.length,1);assert.ok(db.writes[0].sql.startsWith('UPDATE source_checks'));assert.ok(!db.writes[0].sql.includes('DELETE'));
});
test('public refresh accepts only catalog indices and rejects other origins',async()=>{
 assert.equal((await worker.fetch(new Request('https://app.example/api/refresh?source=https://evil.example',{method:'POST'}),{},{})).status,400);
 assert.equal((await worker.fetch(new Request('https://app.example/api/refresh?source=0',{method:'POST',headers:{origin:'https://evil.example'}}),{},{})).status,403);
});

test('scheduled events execute collection and persist an independent scheduler heartbeat',async()=>{
 const db=database(false);const stamp=Date.parse('2026-11-14T06:30:00Z');
 await scheduledCollection({scheduledTime:stamp},{DB:db},()=>{throw Error('Recent source must not be fetched twice');});
 assert.equal(db.writes.length,1);assert.equal(db.writes[0].values[0],'scheduler');
 const heartbeat=JSON.parse(db.writes[0].values[1]);assert.equal(heartbeat.scheduled,'2026-11-14T06:30:00.000Z');assert.equal(heartbeat.result.skipped,true);
});

test('existing articles do not count as newly added',async()=>{
 const result=await collectSource({DB:database(true,0)},0,'manual',async()=>new Response(rss),now);
 assert.equal(result.ok,true);
 assert.equal(result.items,1);
 assert.equal(result.added,0);
});
