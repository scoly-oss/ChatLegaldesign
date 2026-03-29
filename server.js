const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Inject SUPABASE_ANON_KEY from env into a script tag
app.get('/', (req, res) => {
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const injection = `<script>window.SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};</script>`;
  html = html.replace('</head>', injection + '\n</head>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Static files
app.use(express.static(__dirname, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.listen(PORT, () => {
  console.log(`DAIRIA Chat LegalDesign démarré sur le port ${PORT}`);
});
