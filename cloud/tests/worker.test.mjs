import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{authorized,validArticle,ingest} from '../src/index.js';
const token='a'.repeat(48);
const sample={id:'a'.repeat(20),title:'New model',url:'https://example.com/model',source:'OpenAI',published:null,fetched:'2026-11-13T00:00:00Z',excerpt:'Publisher description',topic:'Models & weights',score:70};
test('ingestion requires a private token',async()=>{
 const request=new Request('https://example.com/api/admin/ingest',{method:'POST',body:'{}'});
 assert.equal(authorized(request,token),false);
 assert.equal((await ingest(request,{})).status,401);
});
test('only known sources, topics and safe article URLs are accepted',()=>{
 assert.equal(validArticle(sample),true);
 assert.equal(validArticle({...sample,excerpt:'🤗'.repeat(6000)}),true);
 assert.equal(validArticle({...sample,url:'javascript:alert(1)'}),false);
 assert.equal(validArticle({...sample,source:'Unknown'}),false);
 assert.equal(validArticle({...sample,score:1000}),false);
});
test('ingestion binds values instead of constructing SQL from source text',async()=>{
 let statements=[];
 const env={INGEST_TOKEN:token,DB:{prepare(sql){return {bind(...values){return {sql,values}}}},async batch(items){statements=items}}};
 const r=await ingest(new Request('https://example.com/api/admin/ingest',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({articles:[sample]})}),env);
 assert.equal(r.status,200);assert.equal(statements.length,1);assert.equal(statements[0].values[1],sample.title);
 assert.equal(statements[0].sql.includes(sample.title),false);
});
test('public visitors cannot change the shared feed or preferences',async()=>{
 const response=await worker.fetch(new Request('https://example.com/api/preferences',{method:'PUT',body:'{}'}),{},{});
 assert.equal(response.status,405);
});
test('public news responses exclude personal state stored by other readers',async()=>{
 const env={DB:{prepare(){return {bind(){return {async all(){return {results:[sample]}}}}}}}};
 const response=await worker.fetch(new Request('https://example.com/api/articles'),env,{});
 const rows=await response.json();assert.equal(rows[0].saved,0);assert.equal(rows[0].seen,0);assert.equal(rows[0].summary,undefined);
});
