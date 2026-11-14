// Shared news is public and read-only; each browser owns its saved/read state.
const readerKey='ai-brief-reader-v1';
function readerState(){try{return JSON.parse(localStorage.getItem(readerKey))||{}}catch{return {}}}
function saveReaderState(value){localStorage.setItem(readerKey,JSON.stringify(value))}
async function hostedApi(path,options={}) {
  const state=readerState();
  if(path==='/preferences'&&options.method==='PUT') {
    state.preferences=JSON.parse(options.body);saveReaderState(state);return {ok:true};
  }
  if(path.startsWith('/articles/')&&options.method==='PATCH') {
    const id=path.split('/').pop(),values=JSON.parse(options.body);
    state.marks??={};state.snapshots??={};
    state.marks[id]={...(state.marks[id]||{}),...values};
    if(values.saved===true) state.snapshots[id]=articles.find(a=>a.id===id);
    if(values.saved===false) delete state.snapshots[id];
    saveReaderState(state);return {ok:true};
  }
  if(options.method&&options.method!=='GET') throw Error('The shared feed is read-only');
  const r=await fetch('/api'+path,{cache:'no-store'});
  if(!r.ok)throw Error('Could not load the shared feed. Please retry.');
  const data=await r.json();
  if(path==='/status'&&state.preferences) {
    const selected=state.preferences;
    const available=data.sources.map(s=>s.name);
    const enabled=selected.sources.filter(name=>available.includes(name));
    const active=enabled.length?enabled:available;
    data.preferences={...data.preferences,topics:selected.topics,sources:active};
    data.sources=data.sources.map(s=>({...s,enabled:active.includes(s.name)}));
  }
  if(path==='/articles') {
    const loaded=new Map(data.map(a=>[a.id,{...a,...(state.marks?.[a.id]||{})}]));
    for(const [id,a] of Object.entries(state.snapshots||{})) if(a&&!loaded.has(id))loaded.set(id,{...a,...(state.marks?.[id]||{})});
    return [...loaded.values()];
  }
  return data;
}
