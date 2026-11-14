import asyncio
import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from app import main as m


class SignalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original = m.DB
        m.DB = Path(self.tmp.name) / 'test.db'
        m.init_db()

    def tearDown(self):
        m.DB = self.original
        self.tmp.cleanup()

    def test_canonical_urls_reject_unsafe_and_deduplicate(self):
        self.assertIsNone(m.canonical('javascript:alert(1)'))
        self.assertIsNone(m.canonical('https://user:secret@example.com/a'))
        self.assertEqual(m.canonical('https://example.com/a/?utm_source=rss#foo'), 'https://example.com/a')

    def test_collect_filters_dates_topics_and_preserves_saves(self):
        feed = b'''<rss version="2.0"><channel><title>test</title><item><title>Open model weights</title><link>https://example.com/new?utm_source=rss</link><description>A model with weights</description></item><item><title>Old model</title><link>https://example.com/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>'''
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=feed))) as c:
                await m.fetch_source(c, ('Test', 'https://example.com/feed', 'Models & weights'))
                with m.connect() as db:
                    db.execute('UPDATE articles SET saved=1')
                await m.fetch_source(c, ('Test', 'https://example.com/feed', 'Models & weights'))
        asyncio.run(run())
        with m.connect() as db:
            rows = db.execute('SELECT * FROM articles').fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['saved'], 1)
        self.assertIsNone(rows[0]['published'])

    def test_refresh_uses_only_rss_and_preserves_existing_history(self):
        with m.connect() as db:
            db.execute('INSERT INTO articles(id,title,source,excerpt,saved,seen) VALUES (?,?,?,?,?,?)',
                       ('old','Saved model','OpenAI','Model details',1,1))
        feed=b'<rss version="2.0"><channel><item><title>New model</title><link>https://example.com/new</link><description>New model weights</description></item></channel></rss>'
        calls=[]
        original_client=httpx.AsyncClient
        def handler(request):
            calls.append((request.method,str(request.url)))
            return httpx.Response(200,content=feed)
        def client_factory(**kwargs):
            return original_client(transport=httpx.MockTransport(handler),**kwargs)
        with patch.object(m,'SOURCES',[('OpenAI','https://example.com/rss','Models & weights')]), patch.object(m.httpx,'AsyncClient',client_factory):
            asyncio.run(m.refresh())
        self.assertEqual(calls,[('GET','https://example.com/rss')])
        with m.connect() as db:
            self.assertEqual(db.execute('SELECT saved,seen FROM articles WHERE id=?',('old',)).fetchone()[:],(1,1))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM articles').fetchone()[0],2)
        self.assertIsNotNone(m.get_state('last_refresh'))
        self.assertFalse(m.get_state('refresh')['running'])

    def test_daily_schedule_catches_up_after_restart(self):
        self.assertTrue(m.refresh_due())
        m.set_state('last_refresh',(datetime.now(timezone.utc)-timedelta(hours=23)).isoformat())
        self.assertFalse(m.refresh_due())
        m.init_db()
        self.assertFalse(m.refresh_due())
        m.set_state('last_refresh',(datetime.now(timezone.utc)-timedelta(hours=25)).isoformat())
        self.assertTrue(m.refresh_due())

    def test_legacy_summary_columns_are_not_returned(self):
        with m.connect() as db:
            db.execute("ALTER TABLE articles ADD COLUMN summary TEXT DEFAULT ''")
            db.execute('ALTER TABLE articles ADD COLUMN ai INTEGER DEFAULT 0')
            db.execute('INSERT INTO articles(id,title,source,excerpt,summary,ai) VALUES (?,?,?,?,?,?)',
                       ('legacy','New model','OpenAI','Publisher text','Old generated summary',1))
        article=TestClient(m.app).get('/api/articles').json()[0]
        self.assertEqual(article['excerpt'],'Publisher text')
        self.assertNotIn('summary',article)
        self.assertNotIn('ai',article)

    def test_api_preferences_bookmarks_and_origin_without_password(self):
        client=TestClient(m.app)
        self.assertEqual(client.get('/api/status').status_code,200)
        self.assertEqual(client.put('/api/preferences',json={'topics':['wrong'],'refresh_hours':24}).status_code,400)
        self.assertEqual(client.put('/api/preferences',json={'topics':['Oracle & OCI'],'refresh_hours':12}).status_code,200)
        self.assertEqual(m.preferences()['refresh_hours'],12)
        self.assertNotIn('proxy_configured',client.get('/api/status').json())
        with m.connect() as db:
            db.execute('INSERT INTO articles(id) VALUES (?)',('saved-test',))
        self.assertEqual(client.patch('/api/articles/saved-test',json={'saved':True}).status_code,200)
        self.assertEqual(client.get('/api/articles').json()[0]['saved'],1)
        self.assertEqual(client.post('/api/refresh',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(client.patch('/api/articles/missing',json={'saved':True}).status_code,404)

    def test_source_preferences_are_validated_and_persisted(self):
        client=TestClient(m.app)
        payload={'topics':['Libraries & tools'],'refresh_hours':24,'sources':['NVIDIA Developer']}
        self.assertEqual(client.put('/api/preferences',json=payload).status_code,200)
        m.init_db()
        self.assertEqual(m.preferences()['sources'],['NVIDIA Developer'])
        statuses=client.get('/api/status').json()['sources']
        self.assertEqual([s['name'] for s in statuses if s['enabled']],['NVIDIA Developer'])
        payload['sources']=['Unknown feed']
        self.assertEqual(client.put('/api/preferences',json=payload).status_code,400)

    def test_relevance_excludes_generic_updates(self):
        self.assertFalse(m.relevant('Veteran discounts', 'Free workshops in five cities', 'OpenAI'))
        self.assertFalse(m.relevant('Cloud bill', 'OCI billing for customers', 'Oracle Cloud'))
        self.assertTrue(m.relevant('New model weights', 'Inference library', 'Hugging Face'))
        self.assertTrue(m.relevant('OCI vector search', 'AI database', 'Oracle AI'))

    def test_source_failure_is_observable(self):
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(503))) as c:
                return await m.fetch_source(c,('Offline','https://example.com/feed','AI applications'))
        self.assertFalse(asyncio.run(run())['ok'])


if __name__=='__main__':
    unittest.main()
