// Ceol relay: a tiny private Cloudflare Worker.
// Your app can't call other sites directly (browser security rules), so it asks this Worker,
// which fetches ONE search page, ONE chart page, or ONE Spotify lookup on your behalf, only when you tap.
//
// Settings (Worker > Settings > Variables and Secrets):
//   ACCESS_KEY             a long random password, also typed into Ceol's Settings   (required)
//   ALLOWED_ORIGIN         https://YOUR-USERNAME.github.io   (no path, no trailing slash)   (required)
//   SPOTIFY_CLIENT_ID      from your free Spotify developer app                      (optional: Open in Spotify)
//   SPOTIFY_CLIENT_SECRET  from the same app, add as a Secret                        (optional)

// Bump this when the Worker changes, so the app can tell you if the copy in Cloudflare is out of date
export const VERSION = 4;

const SITE = 'https://www.ultimate-guitar.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9'
};

class UpstreamError extends Error {
  constructor(status, who) { super('upstream ' + status); this.status = status; this.who = who || 'site'; }
}

function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Pages embed their data as JSON inside <div class="js-store" data-content="...">
export function extractStore(html) {
  const m = html.match(/<div[^>]*class="js-store"[^>]*data-content="([^"]*)"/) ||
            html.match(/<div[^>]*data-content="([^"]*)"[^>]*class="js-store"/);
  if (!m) return null;
  try { return JSON.parse(decodeEntities(m[1])); } catch (e) { return null; }
}

const dataOf = store => (((store || {}).store || {}).page || {}).data || {};
const KIND = { chords: /^chords?$/i, tabs: /^tabs?$/i, all: /^(chords?|tabs?)$/i };

// Every matching result on the page (no cap), most-voted first. type: chords, tabs or all.
export function mapSearch(store, type) {
  const want = KIND[type] || KIND.chords;
  return (dataOf(store).results || [])
    .filter(r => r && r.tab_url && want.test(String(r.type || '').trim()))
    .map(r => ({
      kind: KIND.tabs.test(String(r.type || '').trim()) ? 'tabs' : 'chords',
      title: r.song_name, artist: r.artist_name, url: r.tab_url,
      version: r.version || 1, votes: r.votes || 0, rating: r.rating || 0, key: r.tonality_name || ''
    }))
    .sort((a, b) => b.votes - a.votes);
}

// How many results of each format are on this page (Chords, Tabs, Pro, Official...), so the app can say what it found
export function typeCounts(store) {
  const out = {};
  for (const r of dataOf(store).results || []) {
    if (!r || !r.tab_url) continue;
    const t = String(r.type || 'Other').trim() || 'Other';
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

export function pageInfo(store, requested) {
  const d = dataOf(store), pg = d.pagination || {}, raw = (d.results || []).length;
  const page = pg.current || requested, pages = pg.total || 0;
  return { page, pages, hasMore: pages ? page < pages : raw >= 10 };
}

export function mapTab(store) {
  const d = dataOf(store), tab = d.tab || {}, view = d.tab_view || {}, wiki = view.wiki_tab || {};
  if (!wiki.content) return null;
  return {
    title: tab.song_name || '', artist: tab.artist_name || '',
    content: wiki.content, key: (view.meta && view.meta.tonality) || ''
  };
}

export const isTabUrl = u => /^https:\/\/tabs\.ultimate-guitar\.com\/tab\/[\w\-\/%.]+$/.test(u);

// Cached so reopening the same page doesn't hit the site again
async function getHtml(url, ctx, ttl) {
  const cache = caches.default, key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return hit.text();
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new UpstreamError(r.status, 'Ultimate Guitar');
  const html = await r.text();
  ctx.waitUntil(cache.put(key, new Response(html, { headers: { 'Cache-Control': 'public, max-age=' + ttl, 'Content-Type': 'text/html' } })));
  return html;
}

/* ---------- Spotify (optional) ---------- */
let spotifyAuth = { value: '', exp: 0 };
async function spotifyToken(env) {
  if (spotifyAuth.value && Date.now() < spotifyAuth.exp) return spotifyAuth.value;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + btoa(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new UpstreamError(r.status, 'Spotify');
  const j = await r.json();
  spotifyAuth = { value: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 60) * 1000 };
  return spotifyAuth.value;
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function pickTrack(json, artist) {
  const items = ((json || {}).tracks || {}).items || [];
  if (!items.length) return null;
  const a = norm(artist);
  const best = (a && items.find(t => (t.artists || []).some(x => { const n = norm(x.name); return n && (n.includes(a) || a.includes(n)); }))) || items[0];
  return {
    id: best.id, uri: best.uri || 'spotify:track:' + best.id,
    url: (best.external_urls && best.external_urls.spotify) || 'https://open.spotify.com/track/' + best.id,
    name: best.name, artist: (best.artists || []).map(x => x.name).join(', ')
  };
}

async function searchSpotify(token, q, artist) {
  const r = await fetch('https://api.spotify.com/v1/search?type=track&limit=5&q=' + encodeURIComponent(q), { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new UpstreamError(r.status, 'Spotify');
  return pickTrack(await r.json(), artist);
}

// Best effort: tempo comes from a third-party audio-features service, since Spotify closed its own to new apps.
export function parseTempo(json) {
  const arr = Array.isArray(json) ? json : (json && (json.content || json.audio_features || json.data)) || [];
  const t = arr[0] && (arr[0].tempo != null ? arr[0].tempo : arr[0].bpm);
  const n = Math.round(Number(t));
  return n >= 30 && n <= 260 ? n : 0;
}

/* ---------- Tempo (automatic, best effort) ---------- */
// Deezer's public API needs no key. Many tracks have a tempo, some don't (it reports 0), so we try a few candidates.
export function pickDeezer(json, title, artist, max = 3) {
  const items = (json && json.data) || [];
  const t = norm(title), a = norm(artist);
  return items
    .map(x => {
      const xt = norm(x.title || x.title_short), xa = norm(x.artist && x.artist.name);
      const ts = xt && t ? (xt === t ? 3 : (xt.includes(t) || t.includes(xt)) ? 1 : 0) : 0;
      const as = a && xa ? (xa === a ? 3 : (xa.includes(a) || a.includes(xa)) ? 1 : 0) : 0;
      return { id: x.id, ts, as, s: ts + as };
    })
    .filter(x => x.id && x.ts >= 1 && (a ? x.as >= 1 : true))
    .sort((p, q) => q.s - p.s)
    .slice(0, max)
    .map(x => x.id);
}
export function parseDeezerBpm(json) {
  const n = Math.round(Number(json && json.bpm));
  return n >= 30 && n <= 260 ? n : 0;
}

async function getJson(url, ctx, ttl) {
  const cache = caches.default, key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new UpstreamError(r.status, 'the tempo service');
  const text = await r.text();
  ctx.waitUntil(cache.put(key, new Response(text, { headers: { 'Cache-Control': 'public, max-age=' + ttl, 'Content-Type': 'application/json' } })));
  return JSON.parse(text);
}

async function findTempo(env, ctx, title, artist) {
  const week = 604800;
  // 1. Deezer: no key or setup
  try {
    const q = (artist ? 'artist:"' + artist + '" ' : '') + 'track:"' + title + '"';
    let ids = pickDeezer(await getJson('https://api.deezer.com/search?limit=5&q=' + encodeURIComponent(q), ctx, week), title, artist);
    if (!ids.length) ids = pickDeezer(await getJson('https://api.deezer.com/search?limit=5&q=' + encodeURIComponent((title + ' ' + artist).trim()), ctx, week), title, artist);
    for (const id of ids.slice(0, 2)) {
      const bpm = parseDeezerBpm(await getJson('https://api.deezer.com/track/' + id, ctx, week));
      if (bpm) return { bpm, source: 'deezer' };
    }
  } catch (e) { /* fall through to the next source */ }
  // 2. Spotify id + audio-features service (only if you've set Spotify up)
  if (env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET) {
    try {
      const token = await spotifyToken(env);
      let t = await searchSpotify(token, 'track:' + title + (artist ? ' artist:' + artist : ''), artist);
      if (!t) t = await searchSpotify(token, (title + ' ' + artist).trim(), artist);
      if (t) {
        const r = await fetch('https://api.reccobeats.com/v1/audio-features?ids=' + t.id, { headers: { Accept: 'application/json' } });
        if (r.ok) { const bpm = parseTempo(await r.json()); if (bpm) return { bpm, source: 'reccobeats' }; }
      }
    } catch (e) { /* no tempo from this source */ }
  }
  return null;
}

export default {
  async fetch(req, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'null',
      'Access-Control-Allow-Headers': 'X-Key',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.ACCESS_KEY || req.headers.get('X-Key') !== env.ACCESS_KEY) return json({ error: 'Wrong access key' }, 401);
    const u = new URL(req.url), qs = u.searchParams;
    if (u.pathname === '/ping') return json({ ok: true, v: VERSION, spotify: !!(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET) });
    try {
      if (u.pathname === '/search') {
        const q = (qs.get('q') || '').trim().slice(0, 100);
        if (q.length < 2) return json({ error: 'Type at least two letters' }, 400);
        const page = Math.max(1, Math.min(30, parseInt(qs.get('page'), 10) || 1));
        const html = await getHtml(SITE + '/search.php?search_type=title&value=' + encodeURIComponent(q) + '&page=' + page, ctx, 3600);
        const store = extractStore(html);
        if (!store) return json({ error: 'Could not read the search page. The site layout may have changed.' }, 502);
        return json({ v: VERSION, results: mapSearch(store, qs.get('type')), types: typeCounts(store), ...pageInfo(store, page) });
      }
      if (u.pathname === '/tab') {
        const target = qs.get('url') || '';
        if (!isTabUrl(target)) return json({ error: 'Not a chart address' }, 400);
        const html = await getHtml(target, ctx, 86400);
        const tab = mapTab(extractStore(html));
        if (!tab) return json({ error: 'Could not read that page. It may be a Pro or paid page.' }, 502);
        return json(tab);
      }
      if (u.pathname === '/spotify') {
        if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return json({ error: 'Spotify is not set up on this Worker' }, 501);
        const title = (qs.get('title') || '').trim().slice(0, 120), artist = (qs.get('artist') || '').trim().slice(0, 120);
        if (!title) return json({ error: 'Missing title' }, 400);
        const token = await spotifyToken(env);
        let t = await searchSpotify(token, 'track:' + title + (artist ? ' artist:' + artist : ''), artist);
        if (!t) t = await searchSpotify(token, (title + ' ' + artist).trim(), artist);
        return t ? json(t) : json({ error: 'Not found on Spotify' }, 404);
      }
      if (u.pathname === '/tempo') {
        const title = (qs.get('title') || '').trim().slice(0, 120), artist = (qs.get('artist') || '').trim().slice(0, 120);
        if (!title) return json({ error: 'Missing title' }, 400);
        const found = await findTempo(env, ctx, title, artist);
        return found ? json(found) : json({ error: 'No tempo found for that song.' }, 404);
      }
      if (u.pathname === '/bpm') {
        const id = qs.get('id') || '';
        if (!/^[A-Za-z0-9]{22}$/.test(id)) return json({ error: 'Bad track id' }, 400);
        const r = await fetch('https://api.reccobeats.com/v1/audio-features?ids=' + id, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw new UpstreamError(r.status, 'the tempo service');
        const bpm = parseTempo(await r.json());
        return bpm ? json({ bpm }) : json({ error: 'No tempo found for that song.' }, 404);
      }
    } catch (e) {
      if (e instanceof UpstreamError) {
        const blocked = e.status === 403 || e.status === 429;
        return json({ error: blocked ? e.who + ' declined the request (' + e.status + '). Try again later.' : e.who + ' replied with an error (' + e.status + ').' }, 502);
      }
      return json({ error: 'Could not reach the service' }, 502);
    }
    return json({ error: 'Not found' }, 404);
  }
};
