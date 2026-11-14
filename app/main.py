"""AI BookMarks: a personal, source-grounded engineering briefing."""
import asyncio
import hashlib
import json
import logging
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from html import unescape
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

import feedparser
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')
DB = Path(os.getenv('SIGNAL_DB', str(ROOT / 'data/signal.db')))
TOPICS = {
    'AI applications': ['agent', 'rag', 'application', 'tool use', 'workflow', 'mcp', 'open webui'],
    'Models & weights': ['model', 'llm', 'weights', 'open source', 'multimodal', 'inference', 'decision model', 'gemini', 'claude'],
    'Libraries & tools': ['library', 'sdk', 'framework', 'release', 'langchain', 'vllm', 'pytorch', 'ollama', 'lm studio', 'litellm', 'openrouter', 'omniroute'],
    'Training & research': ['train', 'fine-tun', 'lora', 'research', 'dataset', 'benchmark', 'paper'],
    'System design': ['architecture', 'scal', 'latency', 'distributed', 'serving', 'observability', 'retrieval'],
    'Oracle & OCI': ['oracle', 'oci', 'database', 'vector search'],
}
SOURCES = [
    ('OpenAI', 'https://openai.com/news/rss.xml', 'Models & weights'),
    ('Hugging Face', 'https://huggingface.co/blog/feed.xml', 'Models & weights'),
    ('Google Research', 'https://research.google/blog/rss/', 'Training & research'),
    ('NVIDIA Developer', 'https://developer.nvidia.com/blog/feed/', 'Libraries & tools'),
    ('Oracle AI', 'https://blogs.oracle.com/ai-and-datascience/rss', 'Oracle & OCI'),
    ('Oracle Cloud', 'https://blogs.oracle.com/cloud-infrastructure/rss', 'Oracle & OCI'),
    ('Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'Models & weights'),
    ('Google AI', 'https://blog.google/technology/ai/rss/', 'Models & weights'),
    ('OpenRouter Blog', 'https://openrouter.ai/blog/feed.xml', 'AI applications'),
]
log = logging.getLogger('briefly')
refresh_lock = asyncio.Lock()
worker_task = None


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY, title TEXT, url TEXT UNIQUE, source TEXT, published TEXT,
          fetched TEXT, excerpt TEXT, topic TEXT, score INTEGER,
          saved INTEGER DEFAULT 0, seen INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT);
        ''')


def get_state(key, default=None):
    with connect() as db:
        row = db.execute('SELECT value FROM state WHERE key=?', (key,)).fetchone()
    return json.loads(row[0]) if row else default


def set_state(key, value):
    with connect() as db:
        db.execute('INSERT OR REPLACE INTO state VALUES (?,?)', (key, json.dumps(value)))


def preferences():
    stored = get_state('preferences', {})
    available = [source[0] for source in SOURCES]
    selected = [name for name in stored.get('sources', available) if name in available] or available
    return {'topics': stored.get('topics', list(TOPICS)),
            'refresh_hours': stored.get('refresh_hours', 24),
            'sources': selected}


def clean(text):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', ' ', text or ''))).strip()


def canonical(url):
    p = urlsplit(url)
    if p.scheme not in ('https', 'http') or not p.hostname or p.username or p.password:
        return None
    query = [(k, v) for k, v in parse_qsl(p.query) if not k.startswith('utm_') and k not in ('ref', 'fbclid')]
    return urlunsplit((p.scheme, p.netloc.lower(), p.path.rstrip('/') or '/', urlencode(query), ''))


def relevant(title, excerpt, source):
    text = (title + ' ' + excerpt).lower()
    technical = r'\b(model[s]?|llm[s]?|weights|training|fine.tun\w*|inference|rag|agent[s]?|mcp|sdk|api|library|libraries|framework|pytorch|transformers|vllm|codex|developer[s]?|architecture|distributed|latency|retrieval|embedding[s]?|gpu[s]?|kubernetes|dataset[s]?|machine learning|deep learning|reinforcement learning|vector)\b'
    if source.startswith('Oracle'):
        return bool(re.search(r'\b(ai|llm|agent[s]?|machine learning|vector|training|inference|gpu[s]?|mcp)\b', text))
    return bool(re.search(technical, text)) or source.endswith('releases')


def classify(title, excerpt, default, selected):
    text = (title + ' ' + excerpt).lower()
    hits = {topic: sum(word in text for word in words) for topic, words in TOPICS.items()}
    topic = max(hits, key=hits.get) if any(hits.values()) else default
    if default == 'Oracle & OCI':
        topic = default
    score = min(98, 40 + hits[topic] * 7 + (20 if topic in selected else 0))
    return topic, score


async def fetch_source(client, source):
    name, url, default = source
    try:
        response = await client.get(url)
        response.raise_for_status()
        parsed = feedparser.parse(response.content)
        if not parsed.entries:
            raise ValueError('No feed entries returned')
        entries = []
        now = datetime.now(timezone.utc)
        prefs = preferences()
        for item in parsed.entries[:35]:
            link = canonical(item.get('link', ''))
            if not link:
                continue
            stamp = item.get('published_parsed') or item.get('updated_parsed')
            published = datetime(*stamp[:6], tzinfo=timezone.utc) if stamp else None
            if published and (published < now - timedelta(days=30) or published > now + timedelta(days=1)):
                continue
            excerpt = clean(item.get('summary', ''))[:6000]
            title = clean(item.get('title', 'Untitled'))[:500]
            if not relevant(title, excerpt, name):
                continue
            topic, score = classify(title, excerpt, default, prefs['topics'])
            if topic not in prefs['topics']:
                continue
            entries.append((hashlib.sha256(link.encode()).hexdigest()[:20], title, link, name,
                            published.isoformat() if published else None, now.isoformat(), excerpt, topic, score))
        with connect() as db:
            db.executemany('INSERT OR IGNORE INTO articles (id,title,url,source,published,fetched,excerpt,topic,score) VALUES (?,?,?,?,?,?,?,?,?)', entries)
        return {'name': name, 'ok': True, 'items': len(entries), 'checked': now.isoformat()}
    except Exception as exc:
        log.warning('Feed %s failed: %s', name, type(exc).__name__)
        return {'name': name, 'ok': False, 'error': 'Source unavailable or invalid feed', 'checked': datetime.now(timezone.utc).isoformat()}


async def refresh():
    if refresh_lock.locked():
        return
    async with refresh_lock:
        set_state('refresh', {'running': True, 'started': datetime.now(timezone.utc).isoformat()})
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=25, headers={'User-Agent': 'AI BookMarksRSS/1.0 (personal RSS reader)'}) as client:
                selected = preferences()['sources']
                statuses = await asyncio.gather(*(fetch_source(client, s) for s in SOURCES if s[0] in selected))
                set_state('sources', statuses)
                set_state('last_refresh', datetime.now(timezone.utc).isoformat())
                set_state('refresh_error', None)
        except Exception:
            log.exception('Refresh failed')
            set_state('refresh_error', 'Refresh failed; please try again.')
        finally:
            set_state('refresh', {'running': False})


def refresh_due():
    last = get_state('last_refresh')
    return not last or (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() >= preferences()['refresh_hours'] * 3600


async def scheduler():
    while True:
        if refresh_due():
            await refresh()
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app):
    global worker_task
    init_db()
    set_state('refresh', {'running': False})
    worker_task = asyncio.create_task(scheduler())
    yield
    worker_task.cancel()
    for task in list(manual_tasks):
        task.cancel()
    if manual_tasks:
        await asyncio.gather(*manual_tasks, return_exceptions=True)
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title='AI BookMarks · AI updates', lifespan=lifespan)


@app.middleware('http')
async def access(request: Request, call_next):
    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        origin = request.headers.get('origin')
        if origin and urlsplit(origin).netloc != request.headers.get('host'):
            return JSONResponse({'detail': 'Cross-origin request denied'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Content-Security-Policy'] = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
    return response


@app.get('/api/status')
async def status():
    checked = {source['name']: source for source in get_state('sources', [])}
    selected = preferences()['sources']
    sources = [{**checked.get(name, {'name': name, 'ok': False, 'checked': None}),
                'url': url, 'enabled': name in selected} for name, url, _ in SOURCES]
    return {'last_refresh': get_state('last_refresh'), 'refresh': get_state('refresh', {'running': False}),
            'sources': sources, 'refresh_error': get_state('refresh_error'),
            'preferences': preferences(), 'topics': list(TOPICS), 'summary_available': False}


@app.get('/api/articles')
async def articles():
    with connect() as db:
        rows = db.execute('SELECT id,title,url,source,published,fetched,excerpt,topic,score,saved,seen FROM articles ORDER BY COALESCE(published,fetched) DESC').fetchall()
    return [dict(r) for r in rows if r['saved'] or relevant(r['title'] or '', r['excerpt'] or '', r['source'] or '')]


class Prefs(BaseModel):
    topics: list[str] = Field(min_length=1, max_length=6)
    sources: list[str] | None = Field(default=None, min_length=1, max_length=len(SOURCES))
    refresh_hours: int = Field(ge=1, le=168)


@app.put('/api/preferences')
async def update_preferences(body: Prefs):
    if any(t not in TOPICS for t in body.topics):
        raise HTTPException(400, 'Unknown topic')
    if body.sources is not None and any(name not in {s[0] for s in SOURCES} for name in body.sources):
        raise HTTPException(400, 'Unknown source')
    values = body.model_dump()
    if values['sources'] is None:
        values['sources'] = preferences()['sources']
    set_state('preferences', values)
    return {'ok': True}


class ArticleState(BaseModel):
    saved: bool | None = None
    seen: bool | None = None


@app.patch('/api/articles/{article_id}')
async def update_article(article_id: str, body: ArticleState):
    with connect() as db:
        if not db.execute('SELECT 1 FROM articles WHERE id=?', (article_id,)).fetchone():
            raise HTTPException(404, 'Article not found')
        for key, value in body.model_dump(exclude_none=True).items():
            db.execute(f'UPDATE articles SET {key}=? WHERE id=?', (int(value), article_id))
    return {'ok': True}


@app.post('/api/refresh', status_code=202)
async def request_refresh():
    global worker_task
    if refresh_lock.locked():
        return {'ok': True, 'message': 'Already refreshing'}
    # Retain the task for clean shutdown, while the scheduler remains alive.
    task = asyncio.create_task(refresh())
    manual_tasks.add(task)
    task.add_done_callback(manual_tasks.discard)
    return {'ok': True}


manual_tasks = set()
app.mount('/static', StaticFiles(directory=ROOT / 'app/static'), name='static')


@app.get('/')
async def index():
    return FileResponse(ROOT / 'app/static/index.html')
