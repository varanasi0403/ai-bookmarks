"""Publish credential-free RSS snapshots; GitHub Actions persists them in Git."""
import argparse
import asyncio
import json
from pathlib import Path
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
FIELDS=('id','title','url','source','published','fetched','excerpt','topic','score')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seed-existing',action='store_true');args=parser.parse_args()
    from app import main as m
    target=ROOT/'feed';target.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='rss-publication-') as directory:
        if not args.seed_existing:
            previous=json.loads((target/'articles.json').read_text()) if (target/'articles.json').exists() else []
            m.DB=Path(directory)/'news.db';m.init_db()
            with m.connect() as db:
                db.executemany('INSERT OR IGNORE INTO articles (id,title,url,source,published,fetched,excerpt,topic,score) VALUES (?,?,?,?,?,?,?,?,?)',
                               [tuple(a[k] for k in FIELDS) for a in previous])
            asyncio.run(m.refresh())
        checked=m.get_state('sources',[])
        if not any(s['ok'] for s in checked):raise SystemExit('No successful RSS source; leaving published feed unchanged.')
        with m.connect() as db:
            articles=[dict(row) for row in db.execute('SELECT id,title,url,source,published,fetched,excerpt,topic,score FROM articles ORDER BY COALESCE(published,fetched) DESC LIMIT 5000')]
        articles=[a for a in articles if m.relevant(a['title'],a['excerpt'],a['source'])]
        for article in articles:article['excerpt']=article['excerpt'][:1500]
        statuses={s['name']:s for s in checked}
        sources=[{'name':name,'url':url,**statuses.get(name,{'ok':False,'checked':None}),'enabled':True} for name,url,_ in m.SOURCES]
        state={'hosted':True,'last_refresh':m.get_state('last_refresh'),'refresh':{'running':False},'refresh_error':None,
               'sources':sources,'topics':list(m.TOPICS),'preferences':{'topics':list(m.TOPICS),'sources':[s[0] for s in m.SOURCES],'refresh_hours':24}}
        (target/'articles.json').write_text(json.dumps(articles,ensure_ascii=False,separators=(',',':'))+'\n')
        (target/'status.json').write_text(json.dumps(state,ensure_ascii=False,separators=(',',':'))+'\n')
        items=target/'items';items.mkdir(exist_ok=True)
        for article in articles:(items/(article['id']+'.json')).write_text(json.dumps(article,ensure_ascii=False,separators=(',',':'))+'\n')
        print('Published',len(articles),'RSS entries from',sum(s['ok'] for s in sources),'available sources. No secrets needed.')

if __name__=='__main__':main()
