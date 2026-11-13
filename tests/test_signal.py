import asyncio
import json
import tempfile
import unittest
from datetime import datetime, timezone
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

    def test_summary_request_and_validation(self):
        article = dict(id='a', title='New model', source='Test', excerpt='Source evidence', topic='Models & weights')
        with m.connect() as db:
            db.execute('INSERT INTO articles (id) VALUES (?)', ('a',))
        def handler(request):
            payload=json.loads(request.content)
            self.assertNotIn('max_tokens', payload)
            self.assertIn('UNTRUSTED',payload['messages'][0]['content'])
            return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(dict(summary='Brief',why='Useful',action='Try it'))}}]})
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
                await m.summarize(c, article)
        asyncio.run(run())
        with m.connect() as db:
            self.assertEqual(db.execute('SELECT ai FROM articles').fetchone()[0], 1)

    def test_api_preferences_bookmarks_and_origin_without_password(self):
        client=TestClient(m.app)
        self.assertEqual(client.get('/api/status').status_code,200)
        self.assertEqual(client.put('/api/preferences',json={'topics':['wrong'],'daily_limit':8,'refresh_hours':24}).status_code,400)
        self.assertEqual(client.put('/api/preferences',json={'topics':['Oracle & OCI'],'daily_limit':3,'refresh_hours':12}).status_code,200)
        self.assertEqual(m.preferences()['daily_limit'],3)
        with m.connect() as db:
            db.execute('INSERT INTO articles(id) VALUES (?)',('saved-test',))
        self.assertEqual(client.patch('/api/articles/saved-test',json={'saved':True}).status_code,200)
        self.assertEqual(client.get('/api/articles').json()[0]['saved'],1)
        self.assertEqual(client.post('/api/refresh',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(client.patch('/api/articles/missing',json={'saved':True}).status_code,404)

    def test_source_diversity_keeps_oracle_optional(self):
        picks=m.diverse_picks([{'source':'Oracle AI'},{'source':'Oracle Cloud'},{'source':'Ollama releases'},{'source':'OpenAI'}],3)
        self.assertEqual([a['source'] for a in picks],['Oracle AI','Ollama releases','OpenAI'])

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
