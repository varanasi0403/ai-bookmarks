import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const publicDir=path.join(root,'cloud/public');
await fs.mkdir(path.join(publicDir,'static'),{recursive:true});
for(const file of ['style.css','icon.svg']) await fs.copyFile(path.join(root,'app/static',file),path.join(publicDir,'static',file));
let html=await fs.readFile(path.join(root,'app/static/index.html'),'utf8');
html=html.replace('>DV</span>','>AI</span>').replace('Refresh briefing','Sync latest feed')
  .replace('RSS collection runs while the server is awake. Saved articles and collected history stay on disk. No model, subscription, or API key is needed.',
    'The shared feed updates daily in the cloud. Your topics, saved articles, and read state stay in this browser. No model or API key is needed.');
await fs.writeFile(path.join(publicDir,'index.html'),html);
let js=await fs.readFile(path.join(root,'app/static/app.js'),'utf8');
const visitor=await fs.readFile(path.join(root,'cloud/scripts/visitor-state.js'),'utf8');
const apiStart=js.indexOf('async function api('),apiEnd=js.indexOf('\nfunction age(',apiStart);
if(apiStart<0||apiEnd<0)throw Error('App API adapter boundary changed');
js=js.slice(0,apiStart)+visitor+'\nconst api=hostedApi;\n'+js.slice(apiEnd);
const clickStart=js.indexOf("$('#refresh').onclick="),clickEnd=js.indexOf('\nfor(const control',clickStart);
if(clickStart<0||clickEnd<0)throw Error('Refresh adapter boundary changed');
js=js.slice(0,clickStart)+"$('#refresh').onclick=async()=>{await load();toast('Loaded the latest published feed. Collection runs daily in the cloud.');};"+js.slice(clickEnd);
js=js.replace("running?'Collecting updates…':'Refresh briefing'", "'Sync latest feed'");
js+="\n$('#refresh-hours').closest('label').hidden=true;\n";
await fs.writeFile(path.join(publicDir,'static/app.js'),js);
console.log('Built hosted reader: shared news, browser-owned preferences and bookmarks.');
