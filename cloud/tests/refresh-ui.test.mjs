import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const script=await fs.readFile(new URL('../scripts/refresh-ui.js',import.meta.url),'utf8');
function ui({reply={ok:true,added:1},loadFails=false}={}){
 const calls=[],messages=[],labels=[];
 const label={set textContent(v){labels.push(v)}};
 const button={disabled:false,querySelector:()=>label};
 const status={sources:[{index:0,enabled:true},{index:1,enabled:false},{index:5,enabled:true}]};
 const context=vm.createContext({$,status,articles:[{id:'old'}],Promise,Array,
  async fetch(url,options){calls.push(url);assert.equal(options.method,'POST');assert.equal(options.cache,'no-store');return{ok:true,json:async()=>reply};},
  async api(path){calls.push(path);if(loadFails)throw Error('Could not load fresh articles');return path==='/status'?status:[{id:'new'}];},
  renderStatus(){},render(){},toast(message){messages.push(message);}});
 function $(selector){assert.equal(selector,'#refresh');return button;}
 vm.runInContext(script,context);return{button,calls,messages,labels,context};
}
test('Sync collects enabled sources before loading the updated reader',async()=>{
 const x=ui();await x.button.onclick();
 assert.deepEqual(x.calls,['/api/refresh?source=0','/api/refresh?source=5','/status','/articles']);
 assert.ok(x.labels.includes('Checking feeds 2/2…'));assert.equal(x.context.articles[0].id,'new');assert.equal(x.button.disabled,false);
 assert.equal(x.messages[0],'Checked 2 feeds. Added 2 new articles.');
});
test('cooldown reuse is explained instead of claiming a fresh collection',async()=>{
 const x=ui({reply:{skipped:true}});await x.button.onclick();assert.match(x.messages[0],/within the last minute/);
});
test('publisher failures keep the reader and report the problem',async()=>{
 const x=ui({reply:{ok:false}});await x.button.onclick();assert.match(x.messages[0],/2 feeds were unavailable/);assert.match(x.messages[0],/Previous articles are kept/);
});
test('a failed post-collection load does not show a false success message',async()=>{
 const x=ui({loadFails:true});await x.button.onclick();assert.deepEqual(x.messages,['Could not load fresh articles']);assert.equal(x.context.articles[0].id,'old');assert.equal(x.button.disabled,false);
});

test('a successful check with only known articles reports zero additions',async()=>{
 const x=ui({reply:{ok:true,added:0}});
 await x.button.onclick();
 assert.equal(x.messages[0],'Checked 2 feeds. No new articles added.');
});
