'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '512kb' }));

// ===== SECURITY HEADERS =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ===== LEGIFRANCE OAUTH TOKEN CACHE =====
let _legiToken = null;
let _legiExpiry = 0;

async function getLegifranceToken() {
  if (_legiToken && Date.now() < _legiExpiry) return _legiToken;
  const clientId = process.env.LEGIFRANCE_CLIENT_ID;
  const clientSecret = process.env.LEGIFRANCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid'
    });
    const resp = await fetch('https://oauth.piste.gouv.fr/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    _legiToken = data.access_token;
    _legiExpiry = Date.now() + Math.max((data.expires_in - 60) * 1000, 0);
    return _legiToken;
  } catch {
    return null;
  }
}

// ===== INPUT VALIDATION =====
function sanitizeQuery(q) {
  if (typeof q !== 'string') return '';
  return q.replace(/[<>"]/g, '').slice(0, 500).trim();
}

// ===== LEGIFRANCE SEARCH PROXY =====
app.post('/api/legal/search', async (req, res) => {
  const query = sanitizeQuery(req.body.query);
  const fond = req.body.fond || 'CODE_DATE';
  const pageSize = Math.min(Math.max(parseInt(req.body.pageSize) || 5, 1), 10);

  const VALID_FONDS = ['CODE_DATE', 'LODA_DATE', 'JURI', 'CETAT', 'KALI', 'CIRC', 'CONSTIT'];
  if (!query) return res.status(400).json({ error: 'query requis' });
  if (!VALID_FONDS.includes(fond)) return res.status(400).json({ error: 'fond invalide' });

  const token = await getLegifranceToken();
  if (!token) {
    return res.status(200).json({
      results: [],
      totalResultNumber: 0,
      configured: false,
      note: 'Legifrance API non configurée — ajoutez LEGIFRANCE_CLIENT_ID et LEGIFRANCE_CLIENT_SECRET sur Render'
    });
  }

  try {
    const body = {
      recherche: {
        champs: [{
          typeChamp: 'ALL',
          criteres: [{
            typeRecherche: 'TOUS_LES_MOTS_DANS_UN_CHAMP',
            valeur: query,
            operateur: 'ET'
          }],
          operateur: 'ET'
        }],
        filtres: [],
        pageNumber: 1,
        pageSize,
        operateur: 'ET',
        sort: 'PERTINENCE',
        typePagination: 'DEFAUT'
      },
      fond
    };

    const resp = await fetch(
      'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/search',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: 'Erreur Legifrance', detail: errText.slice(0, 300) });
    }

    const data = await resp.json();
    res.json({ ...data, configured: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur interne', detail: err.message });
  }
});

// ===== LEGIFRANCE ARTICLE PROXY =====
app.post('/api/legal/article', async (req, res) => {
  const id = typeof req.body.id === 'string' ? req.body.id.replace(/[^A-Z0-9]/g, '') : '';
  if (!id || id.length < 10 || id.length > 30) {
    return res.status(400).json({ error: 'id invalide' });
  }

  const token = await getLegifranceToken();
  if (!token) return res.status(503).json({ error: 'Service non configuré' });

  try {
    const resp = await fetch(
      'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/getArticle',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      }
    );
    if (!resp.ok) return res.status(resp.status).json({ error: 'Article non trouvé' });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur interne', detail: err.message });
  }
});

// ===== BOSS SEARCH PROXY =====
app.post('/api/boss/search', async (req, res) => {
  const query = sanitizeQuery(req.body.query);
  if (!query) return res.status(400).json({ error: 'query requis' });

  const searchUrl = `https://boss.gouv.fr/portail/jcms/search?q=${encodeURIComponent(query)}&lang=fr`;

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; DAIRIA/1.0)'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!resp.ok) {
      return res.json({
        source: 'boss',
        results: [],
        search_url: searchUrl,
        note: 'BOSS inaccessible — consultez directement boss.gouv.fr'
      });
    }

    const html = await resp.text();

    // Extract results from BOSS search HTML
    const results = [];
    const linkRegex = /<a[^>]+href="([^"]*portail[^"]*)"[^>]*>([^<]{10,150})<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
      const href = match[1];
      const title = match[2].replace(/\s+/g, ' ').trim();
      if (title && href && !href.includes('search') && !href.includes('#')) {
        const url = href.startsWith('http') ? href : `https://boss.gouv.fr${href}`;
        results.push({ title, url });
      }
    }

    res.json({
      source: 'boss',
      results,
      search_url: searchUrl,
      configured: true
    });
  } catch {
    res.json({
      source: 'boss',
      results: [],
      search_url: searchUrl,
      note: 'Consultez directement boss.gouv.fr'
    });
  }
});

// ===== STATIC FILES =====
app.get('/', (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const supabaseKey = (process.env.SUPABASE_ANON_KEY || '')
      .replace(/[<>"']/g, '');
    html = html.replace('__SUPABASE_ANON_KEY__', supabaseKey);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('Erreur serveur');
  }
});

app.use(express.static(path.join(__dirname), {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Serveur DAIRIA sur port ${PORT}`));
