"""Collect RSS on a cloud runner and publish idempotent batches to the Worker."""
import argparse
import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path
import httpx
from dotenv import dotenv_values

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))


def upload(site_url,token,articles,collection):
    if not token or len(token)<32:raise SystemExit('Set INGEST_TOKEN to the Worker ingestion secret.')
    base=site_url.rstrip('/')
    if not base.startswith('https://') and not base.startswith('http://127.0.0.1:'):raise SystemExit('SITE_URL must be HTTPS (or a loopback preview).')
    with httpx.Client(timeout=60,headers={'Authorization':'Bearer '+token}) as client:
        def send(method,path,**kwargs):
            for attempt in range(3):
                try:
                    response=client.request(method,base+path,**kwargs)
                    if response.status_code<500 and response.status_code!=429:
                        response.raise_for_status()
                        return response
                    if attempt==2:response.raise_for_status()
                except httpx.RequestError:
                    if attempt==2:raise
                time.sleep(2**attempt)
        for offset in range(0,len(articles),20):
            send('POST','/api/admin/ingest',json={'articles':articles[offset:offset+20]})
        send('POST','/api/admin/ingest',json={'articles':[],'collection':collection})
        state=send('GET','/api/admin/status').json()
        if state.get('last_refresh')!=collection['last_refresh']:raise RuntimeError('Published collection did not match readback')
        print('Published',len(articles),'entries; stored total:',state['total'],'; sources checked:',len(collection['sources']))



def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seed-existing',action='store_true');args=parser.parse_args()
    from app import main as m
    settings=dotenv_values(ROOT/'cloud/.dev.vars')
    url=os.getenv('SITE_URL') or settings.get('SITE_URL','')
    token=os.getenv('INGEST_TOKEN') or settings.get('INGEST_TOKEN','')
    if not url or not token:raise SystemExit('Set SITE_URL and INGEST_TOKEN before publishing.')
    with tempfile.TemporaryDirectory(prefix='rss-collector-') as directory:
        if not args.seed_existing:
            m.DB=Path(directory)/'collection.db';m.init_db();asyncio.run(m.refresh())
        with m.connect() as db:
            articles=[dict(row) for row in db.execute('SELECT id,title,url,source,published,fetched,excerpt,topic,score FROM articles')]
        articles=[a for a in articles if m.relevant(a['title'],a['excerpt'],a['source'])]
        collection={'last_refresh':m.get_state('last_refresh'),'sources':m.get_state('sources',[])}
        if not collection['last_refresh'] or not any(s['ok'] for s in collection['sources']):raise SystemExit('No successful feed collection; keeping the previously published feed.')
        upload(url,token,articles,collection)

if __name__=='__main__':main()
