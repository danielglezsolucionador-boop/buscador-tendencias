const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.static('.'));
app.use(express.json());

const SC_KEY = process.env.SCRAPECREATORS_API_KEY;
const YT_KEY = process.env.YOUTUBE_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ─── CACHE ──────────────────────────────────────────────────────────────────
let cache = { automatico: null, lastManual: null };
const CACHE_TTL = 23 * 60 * 60 * 1000;

// ─── RSS FEEDS GRATUITOS ────────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: 'https://www.anthropic.com/rss.xml',             fuente: 'Anthropic Blog' },
  { url: 'https://openai.com/blog/rss.xml',               fuente: 'OpenAI Blog' },
  { url: 'https://huggingface.co/blog/feed.xml',          fuente: 'HuggingFace' },
  { url: 'https://github.blog/feed/',                     fuente: 'GitHub Blog' },
  { url: 'https://www.reddit.com/r/artificial/.rss',      fuente: 'Reddit/artificial' },
  { url: 'https://www.reddit.com/r/MachineLearning/.rss', fuente: 'Reddit/ML' },
];

async function leerRSS(feed) {
  try {
    const r = await axios.get(feed.url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BuscadorTendencias/1.0)' }
    });
    const xml = r.data;
    const items = [];
    const entryRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null && items.length < 5) {
      const bloque = match[1];
      const titleMatch = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(bloque);
      const linkMatch  = /<link[^>]*>(?:<!\[CDATA\[)?(https?[^<\]]+)/.exec(bloque) ||
                         /<link[^>]*href="([^"]+)"/.exec(bloque);
      const dateMatch  = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(bloque) ||
                         /<published>([\s\S]*?)<\/published>/.exec(bloque) ||
                         /<updated>([\s\S]*?)<\/updated>/.exec(bloque);
      if (titleMatch && titleMatch[1].trim().length > 5) {
        items.push({
          texto: titleMatch[1].trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"'),
          url:   linkMatch ? linkMatch[1].trim() : '',
          fecha: dateMatch ? new Date(dateMatch[1]).toLocaleDateString('es-ES') : '',
          fuente: feed.fuente,
          likes: 0,
          tipo: 'rss'
        });
      }
    }
    return items;
  } catch(e) { return []; }
}

// ─── YOUTUBE API OFICIAL ─────────────────────────────────────────────────────
async function buscarYouTubeAPI(query) {
  try {
    const r = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part:'snippet', q:query, type:'video', maxResults:5, order:'date', key:YT_KEY },
      timeout: 8000
    });
    return (r.data.items || []).map(i => ({
      texto: i.snippet.title,
      url:   `https://youtube.com/watch?v=${i.id.videoId}`,
      fecha: new Date(i.snippet.publishedAt).toLocaleDateString('es-ES'),
      canal: i.snippet.channelTitle,
      thumbnail: i.snippet.thumbnails?.default?.url || '',
      fuente: 'YouTube',
      likes: 0,
      tipo: 'youtube'
    }));
  } catch(e) { return []; }
}

// ─── X/TWITTER — 6 cuentas automático ───────────────────────────────────────
const CUENTAS_X = ['AnthropicAI','OpenAI','sama','GoogleDeepMind','ylecun','MistralAI'];

async function buscarTwitterUsuario(handle) {
  try {
    const r = await axios.get('https://api.scrapecreators.com/v2/twitter/user/tweets', {
      params: { handle },
      headers: { 'x-api-key': SC_KEY },
      timeout: 10000
    });
    const tweets = r.data?.tweets || r.data?.data || r.data?.results || [];
    return tweets.slice(0,2).map(t => ({
      texto: t.text || t.full_text || t.legacy?.full_text || '',
      url:   `https://x.com/${handle}/status/${t.id || t.id_str || ''}`,
      likes: t.favorite_count || t.legacy?.favorite_count || t.likes || 0,
      retweets: t.retweet_count || t.legacy?.retweet_count || 0,
      fuente: `X/@${handle}`,
      tipo: 'x'
    })).filter(t => t.texto.length > 10);
  } catch(e) { return []; }
}

// ─── TIKTOK (MANUAL) ─────────────────────────────────────────────────────────
async function buscarTikTok(keyword) {
  try {
    const r = await axios.get('https://api.scrapecreators.com/v1/tiktok/search/top', {
      params: { query: keyword },
      headers: { 'x-api-key': SC_KEY },
      timeout: 10000
    });
    return (r.data?.items || []).slice(0,5).map(i => ({
      texto: i.desc || i.title || '',
      url:   i.video?.play || '',
      likes: i.statistics?.digg_count || 0,
      vistas: i.statistics?.play_count || 0,
      fuente: 'TikTok',
      tipo: 'tiktok'
    })).filter(i => i.texto);
  } catch(e) { return []; }
}

// ─── LINKEDIN (MANUAL) ───────────────────────────────────────────────────────
async function buscarLinkedIn(keyword) {
  try {
    const r = await axios.get('https://api.scrapecreators.com/v1/linkedin/search/posts', {
      params: { query: keyword },
      headers: { 'x-api-key': SC_KEY },
      timeout: 10000
    });
    const posts = r.data?.posts || r.data?.items || r.data?.results || [];
    return posts.slice(0,5).map(p => ({
      texto: p.text || p.content || p.title || '',
      likes: p.numLikes || p.likes || 0,
      fuente: 'LinkedIn',
      tipo: 'linkedin'
    })).filter(p => p.texto);
  } catch(e) { return []; }
}

// ─── ANÁLISIS CON ANTHROPIC ──────────────────────────────────────────────────
async function analizarConIA(tendencias) {
  if (!ANTHROPIC_KEY || !tendencias.length) return null;
  try {
    const resumen = tendencias.slice(0,10).map(t => `- [${t.fuente}] ${t.texto.substring(0,200)}`).join('\n');
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role:'user', content: `Eres analista de tendencias de IA. Analiza estas tendencias y devuelve SOLO JSON sin markdown:\n{"analisis":[{"nombre":"nombre corto","puntuacion":8,"es_humo":false,"es_viral":true,"resumen":"2-3 oraciones","areas_beneficiadas":["Marketing"],"como_ayuda":"consejo práctico","fuente":"X/@OpenAI"}]}\n\nTendencias:\n${resumen}` }]
    }, {
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 30000
    });
    const text = r.data?.content?.[0]?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    return parsed.analisis || null;
  } catch(e) { return null; }
}

// ─── RECOPILACIÓN AUTOMÁTICA ─────────────────────────────────────────────────
async function recopilarAutomatico() {
  console.log('[AUTO] Iniciando recopilación...');
  const rssResults = await Promise.all(RSS_FEEDS.map(f => leerRSS(f)));
  const rssFlat    = rssResults.flat();
  const youtube    = await buscarYouTubeAPI('inteligencia artificial 2025');
  const xResults   = await Promise.all(CUENTAS_X.map(h => buscarTwitterUsuario(h)));
  const xFlat      = xResults.flat();

  const todos = [...rssFlat, ...youtube, ...xFlat];
  todos.sort((a,b) => (b.likes + (b.retweets||0)*2) - (a.likes + (a.retweets||0)*2));

  const analisis = await analizarConIA(todos);

  cache.automatico = {
    data: {
      success: true,
      tipo: 'automatico',
      raw: todos,
      analisis,
      timestamp: new Date().toISOString(),
      fuentes: { rss: rssFlat.length, youtube: youtube.length, x: xFlat.length }
    },
    timestamp: Date.now()
  };
  console.log(`[AUTO] ✅ RSS:${rssFlat.length} YT:${youtube.length} X:${xFlat.length}`);
  return cache.automatico.data;
}

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────
app.get('/api/tendencias', async (req, res) => {
  if (cache.automatico && (Date.now() - cache.automatico.timestamp) < CACHE_TTL)
    return res.json(cache.automatico.data);
  const data = await recopilarAutomatico();
  res.json(data);
});

app.post('/api/buscar', async (req, res) => {
  const { keyword, plataformas } = req.body;
  const query = keyword || 'inteligencia artificial';
  const plats = plataformas || ['tiktok'];
  try {
    const tasks = [];
    if (plats.includes('tiktok'))   tasks.push(buscarTikTok(query));
    if (plats.includes('linkedin')) tasks.push(buscarLinkedIn(query));
    if (plats.includes('youtube'))  tasks.push(buscarYouTubeAPI(query));
    const results = await Promise.all(tasks);
    const todos = results.flat();
    todos.sort((a,b) => (b.likes + (b.retweets||0)*2) - (a.likes + (a.retweets||0)*2));
    const analisis = await analizarConIA(todos);
    cache.lastManual = { keyword:query, plataformas:plats, resultados:todos.length };
    res.json({ success:true, tipo:'manual', keyword:query, plataformas:plats, raw:todos, analisis, timestamp: new Date().toISOString() });
  } catch(e) {
    res.json({ success:false, error:e.message });
  }
});

app.post('/api/refresh', async (req, res) => {
  cache.automatico = null;
  const data = await recopilarAutomatico();
  res.json(data);
});
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
app.get('/api/status', (req, res) => {
  res.json({
    cache_auto: cache.automatico ? {
      timestamp: cache.automatico.data.timestamp,
      fuentes: cache.automatico.data.fuentes,
      items: cache.automatico.data.raw?.length || 0,
      vencido: (Date.now() - cache.automatico.timestamp) > CACHE_TTL
    } : null,
    ultimo_manual: cache.lastManual,
    apis: { anthropic: !!ANTHROPIC_KEY, youtube: !!YT_KEY, scrapecreators: !!SC_KEY }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Buscador corriendo en http://localhost:${PORT}`);
  recopilarAutomatico().catch(e => console.error('[AUTO] Error inicial:', e.message));
});