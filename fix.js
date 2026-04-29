const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');

const nuevaBuscarTikTok = `async function buscarTikTok(keyword) {
  try {
    const r = await axios.post('https://creador-apis-production.up.railway.app/api/buscar', {
      keyword, plataforma: 'tiktok'
    }, { timeout: 30000 });
    return (r.data?.datos || []).slice(0,5).map(i => ({
      texto: i.titulo || '',
      url: i.url || '',
      likes: i.likes || 0,
      vistas: i.vistas || 0,
      fuente: 'TikTok',
      tipo: 'tiktok'
    })).filter(i => i.texto);
  } catch(e) { return []; }
}`;

const nuevaBuscarLinkedIn = `async function buscarLinkedIn(keyword) {
  try {
    const r = await axios.post('https://creador-apis-production.up.railway.app/api/buscar', {
      keyword, plataforma: 'linkedin'
    }, { timeout: 30000 });
    return (r.data?.datos || []).slice(0,5).map(p => ({
      texto: p.titulo || p.texto || '',
      likes: p.likes || 0,
      fuente: 'LinkedIn',
      tipo: 'linkedin'
    })).filter(p => p.texto);
  } catch(e) { return []; }
}`;

const nuevaBuscarTwitter = `async function buscarTwitterUsuario(handle) {
  try {
    const r = await axios.post('https://creador-apis-production.up.railway.app/api/buscar', {
      handle, plataforma: 'twitter'
    }, { timeout: 30000 });
    return (r.data?.datos || []).slice(0,2).map(t => ({
      texto: t.texto || '',
      url: t.url || '',
      likes: t.likes || 0,
      retweets: t.retweets || 0,
      fuente: \`X/@\${handle}\`,
      tipo: 'x'
    })).filter(t => t.texto.length > 10);
  } catch(e) { return []; }
}`;

// Reemplazar funciones
c = c.replace(/async function buscarTikTok[\s\S]*?^}/m, nuevaBuscarTikTok);
c = c.replace(/async function buscarLinkedIn[\s\S]*?^}/m, nuevaBuscarLinkedIn);
c = c.replace(/async function buscarTwitterUsuario[\s\S]*?^}/m, nuevaBuscarTwitter);

fs.writeFileSync('server.js', c);
console.log('listo');