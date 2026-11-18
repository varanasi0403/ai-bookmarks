import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const publicDir=path.join(root,'cloud/public');
await fs.mkdir(path.join(publicDir,'static'),{recursive:true});
for(const file of ['style.css','icon.svg']) await fs.copyFile(path.join(root,'app/static',file),path.join(publicDir,'static',file));
let html=await fs.readFile(path.join(root,'app/static/index.html'),'utf8');
html=html.replace('>DV</span>','>AI</span>').replace('Refresh briefing','Sync latest feed')
  .replace('RSS collection runs while the server is awake. Saved articles and collected history stay on disk. No model, subscription, or API key is needed.',
    'Feeds are checked automatically in the cloud, with a full source rotation about every 18 minutes. Sync latest feed checks your enabled sources. Overlapping checks and repeat syncs within one minute are skipped. Your saved articles and preferences stay in this browser.');
await fs.writeFile(path.join(publicDir,'index.html'),html);
let js=await fs.readFile(path.join(root,'app/static/app.js'),'utf8');
const visitor=await fs.readFile(path.join(root,'cloud/scripts/visitor-state.js'),'utf8');
const apiStart=js.indexOf('async function api('),apiEnd=js.indexOf('\nfunction age(',apiStart);
if(apiStart<0||apiEnd<0)throw Error('App API adapter boundary changed');
js=js.slice(0,apiStart)+visitor+'\nconst api=hostedApi;\n'+js.slice(apiEnd);
const clickStart=js.indexOf("$('#refresh').onclick="),clickEnd=js.indexOf('\nfor(const control',clickStart);
if(clickStart<0||clickEnd<0)throw Error('Refresh adapter boundary changed');
const refreshCode=await fs.readFile(path.join(root,'cloud/scripts/refresh-ui.js'),'utf8');
js=js.slice(0,clickStart)+refreshCode+js.slice(clickEnd);
js=js.replace("$('#refresh').disabled=running;$('#refresh span').textContent=running?'Collecting updates…':'Refresh briefing';", "$('#refresh').disabled=running||refreshingFeeds;if(!refreshingFeeds)$('#refresh span').textContent='Sync latest feed';");
js=js.replace('if(!document.hidden)load()', 'if(!document.hidden&&!refreshingFeeds)load()').replace('},6000)', '},60000)');
js+="\n$('#refresh-hours').closest('label').hidden=true;\n";
await fs.writeFile(path.join(publicDir,'static/app.js'),js);
console.log('Built hosted reader: shared news, browser-owned preferences and bookmarks.');
