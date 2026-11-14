let refreshingFeeds=false;
$('#refresh').onclick=async()=>{
 if(refreshingFeeds)return;
 refreshingFeeds=true;const button=$('#refresh');button.disabled=true;
 const label=button.querySelector('span');let done=0;const results=[];
 const queue=status.sources.map((s,index)=>({...s,index:s.index??index})).filter(s=>s.enabled).map(s=>s.index);
 const total=queue.length;
 const collect=async()=>{while(queue.length){const index=queue.shift();
  try{const r=await fetch('/api/refresh?source='+index,{method:'POST',cache:'no-store'});
   if(!r.ok)throw Error('Could not check source');results.push(await r.json());
  }catch{results.push({ok:false});}
  done++;label.textContent=`Checking feeds ${done}/${total}…`;
 }};
 try{
  await Promise.all(Array.from({length:3},()=>collect()));
  // Fetch after the collection requests finish; do not reuse stale browser/edge snapshots.
  [status,articles]=await Promise.all([api('/status'),api('/articles')]);renderStatus();render();
  const failed=results.filter(r=>r.ok===false).length,checked=results.filter(r=>r.ok).length;
  if(failed)toast(`Checked feeds; ${failed} unavailable. Previous articles are kept. See Sources.`);
  else if(!checked)toast('Feeds were checked recently. Loaded the latest articles; try again after the 10-minute cooldown.');
  else toast(`Checked ${checked} feeds and loaded the latest articles.`);
 }catch(error){toast(error.message||'Could not refresh. Please try again.');}
 finally{refreshingFeeds=false;button.disabled=false;label.textContent='Sync latest feed';}
};
