import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{validArticle,summarize,snapshot} from '../src/index.js';
const id='a'.repeat(20);
const article={id,title:'New model',url:'https://example.com/model',source:'OpenAI',published:null,fetched:'2026-11-13T00:00:00Z',excerpt:'A model with published weights.',topic:'Models & weights',score:70};
function database({cached=null,budget=true,storedArticle=null}={}){
 const writes=[];
 return {writes,prepare(sql){return{bind(...values){return{
  async first(){if(sql.startsWith('SELECT summary'))return cached;if(sql.startsWith('SELECT id,title'))return storedArticle;if(sql.startsWith('INSERT INTO summaries'))return{article_id:id};if(sql.startsWith('INSERT INTO summary_usage'))return budget?{used:1}:null;throw Error('Unexpected query');},
  async run(){writes.push({sql,values});return{success:true};}
 }}}}};
}
const request=()=>new Request('https://app.example/api/summary/'+id,{method:'POST'});
test('only known sources and safe article URLs are accepted',()=>{
 assert.equal(validArticle(article),true);assert.equal(validArticle({...article,url:'javascript:alert(1)'}),false);assert.equal(validArticle({...article,source:'Unknown'}),false);
});
test('summaries are optional when no provider key is configured',async()=>{
 const response=await summarize(request(),{DB:database()},id,()=>{throw Error('Provider must not be called')});assert.equal(response.status,503);
});
test('cached summaries do not consume another provider call',async()=>{
 const response=await summarize(request(),{DB:database({cached:{status:'ready',summary:'Cached text',model:'openai/gpt-oss-20b'}})},id,()=>{throw Error('Unexpected network call')});
 assert.equal((await response.json()).cached,true);
});
test('the shared daily cap is enforced before calling the model',async()=>{
 const db=database({budget:false});let calls=0;
 const response=await summarize(request(),{DB:db,GROQ_API_KEY:'test-only'},id,async url=>{assert.ok(url.includes('/feed/items/'));calls++;return Response.json(article)});
 assert.equal(response.status,429);assert.equal(calls,1);assert.ok(db.writes[0].sql.includes("status='failed'"));
});
test('generation uses only the selected publisher excerpt and caches the result',async()=>{
 const db=database();let calls=0;
 const response=await summarize(request(),{DB:db,GROQ_API_KEY:'test-only'},id,async(url,options)=>{
  calls++;if(url.includes('/feed/items/'))return Response.json(article);
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');const body=JSON.parse(options.body);
  assert.equal(body.model,'openai/gpt-oss-20b');assert.equal(body.include_reasoning,false);assert.ok(body.messages[0].content.includes('UNTRUSTED'));
  assert.deepEqual(JSON.parse(body.messages[1].content),{title:article.title,source:article.source,excerpt:article.excerpt});
  return Response.json({choices:[{message:{content:'A concise grounded summary.'}}]});
 });
 assert.equal(response.status,200);assert.equal((await response.json()).summary,'A concise grounded summary.');assert.equal(calls,2);assert.ok(db.writes.at(-1).sql.includes("status='ready'"));
});
test('provider failures keep the feed usable',async()=>{
 const response=await summarize(request(),{DB:database(),GROQ_API_KEY:'test-only'},id,async url=>url.includes('/feed/items/')?Response.json(article):new Response('',{status:429}));assert.equal(response.status,503);
});
test('public visitors cannot change shared preferences or make cross-origin summary calls',async()=>{
 assert.equal((await worker.fetch(new Request('https://app.example/api/preferences',{method:'PUT'}),{},{})).status,405);
 assert.equal((await worker.fetch(new Request('https://app.example/api/summary/'+id,{method:'POST',headers:{origin:'https://other.example'}}),{},{})).status,403);
});
test('news snapshots are streamed without model calls',async()=>{
 const response=await snapshot('articles.json',new Request('https://app.example/api/articles'),{},async url=>{assert.ok(url.startsWith('https://raw.githubusercontent.com/varanasi0403/ai-bookmarks/'));return Response.json([article]);});
 assert.equal((await response.json())[0].id,id);
});

test('newly collected D1 articles can be summarized without a GitHub item file',async()=>{
 const response=await summarize(request(),{DB:database({storedArticle:article}),GROQ_API_KEY:'test-only'},id,async url=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  return Response.json({choices:[{message:{content:'A summary of the new article.'}}]});
 });
 assert.equal(response.status,200);assert.equal((await response.json()).summary,'A summary of the new article.');
});
