"""Generate a credential-free source catalog shared by the Worker and collector."""
import json
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root))
from app.main import SOURCES,TOPICS
catalog={'sources':[{'name':name,'url':url,'topic':topic} for name,url,topic in SOURCES],'topics':list(TOPICS)}
(root/'cloud/src/catalog.js').write_text('export const sources='+json.dumps(catalog['sources'])+';\nexport const topics='+json.dumps(catalog['topics'])+';\nexport const keywords='+json.dumps(TOPICS)+';\n')
print('Exported',len(SOURCES),'source endpoints.')
