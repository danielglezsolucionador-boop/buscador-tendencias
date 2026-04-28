const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.static('.'));
app.use(express.json());

const SC_KEY = process.env.SCRAPECREATORS_API_KEY;

const CUENTAS_X = ['AnthropicAI','OpenAI','sama','GoogleDeepMind','ylecun','MistralAI'];

async function buscarTikTok(keyword) {
  try {
    const r = await axios.get(`https://api.scrapecreators.com/v1/tiktok/search/top?query=${encodeURIComponent(keyword)}`, { headers: { 'x-api-key': SC_KEY } });
    return (r.data?.items || []).slice(0,3).map(i => ({ texto: i.desc||'', likes: i.statistics?.digg_count||0, vistas: i.statistics?.play_count||0, fuente: 'TikTok' })).filter(i=>i.texto);
  } catch(e) { return []; }
}

async function buscarYouTube(keyword) {
  try {
    const r = await axios.get(`https://api.scrapecreators.com/v1/youtube/search?query=${encodeURIComponent(keyword)}`, { headers: { 'x-api-key': SC_KEY } });
    const items = r.data?.videos || r.data?.items || r.data?.results || [];
    return items.slice(0,3).map(i => ({ texto: i.title||i.desc||'', likes: i.likes||0, vistas: i.views||0, fuente: 'YouTube' })).filter(i=>i.texto);
  } catch(e) { return []; }
}

async function buscarTwitterUsuario(handle) {
  try {
    const r = await axios.get(`https://api.scrapecreators.com/v1/twitter/user-tweets?handle=${handle}`, { headers: { 'x-api-key': SC_KEY } });
    const tweets = r.data?.tweets || r.data?.data || r.data?.results || [];
    return tweets.slice(0,2).map(t => ({ texto: t.text||t.full_text||'', likes: t.favorite_count||t.likes||0, retweets: t.retweet_count||t.retweets||0, fuente: `X/@${handle}` })).filter(t=>t.texto);
  } catch(e) { return []; }
}

app.post('/api/buscar', async (req, res) => {
  const { keyword } = req.body;
  const query = keyword || 'inteligencia artificial';
  try {
    const [tiktok, youtube, ...xResults] = await Promise.all([
      buscarTikTok(query),
      buscarYouTube(query),
      ...CUENTAS_X.slice(0,3).map(h => buscarTwitterUsuario(h))
    ]);
    const todos = [...tiktok, ...youtube, ...xResults.flat()];
    todos.sort((a,b) => (b.likes + (b.retweets||0)*2) - (a.likes + (a.retweets||0)*2));
    if(!todos.length) return res.json({ success:false, error:'No se encontraron tendencias.' });
    res.json({ success:true, keyword:query, raw:todos, analisis:null });
  } catch(e) {
    res.json({ success:false, error:e.message });
  }
});

app.listen(3001, () => console.log('Buscador corriendo en http://localhost:3001'));