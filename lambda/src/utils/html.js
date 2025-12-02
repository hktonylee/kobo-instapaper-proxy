import { MINIMAL_STYLES } from './constants.js';

export const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const buildArticleHtml = (title, bodyHtml) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${MINIMAL_STYLES}</style>
</head>
<body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    ${bodyHtml}
  </article>
</body>
</html>`;

export const buildWelcomePage = (proxyBase) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to the Proxy</title>
  <style>
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: #f6f8fb; color: #1f2933; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; padding: 1.75rem; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); width: min(560px, 92vw); }
    h1 { font-size: 1.8rem; margin: 0 0 0.35rem; }
    form { display: flex; gap: 0.6rem; margin-top: 0.75rem; }
    input[type="search"] { flex: 1; padding: 0.85rem 1rem; border: 1px solid #d4d8dd; border-radius: 12px; font-size: 1rem; transition: border-color 0.2s, box-shadow 0.2s; }
    input[type="search"]:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18); }
    button { padding: 0.85rem 1.1rem; border: none; border-radius: 12px; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 600; cursor: pointer; transition: transform 0.1s ease, box-shadow 0.2s ease; }
    button:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24); }
  </style>
</head>
<body>
  <main class="card" aria-labelledby="welcome-title">
    <h1 id="welcome-title">Search or paste a link</h1>
    <form id="search-form" action="${proxyBase || ''}/https://duckduckgo.com/" method="get">
      <input id="search-input" type="search" name="q" placeholder="Search DuckDuckGo or paste https:// URL" required />
      <button type="submit">Search</button>
    </form>
  </main>
  <script>
    const proxyBase = ${JSON.stringify(proxyBase || '')};
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');

    form?.addEventListener('submit', (event) => {
      const query = input?.value?.trim() || '';

      if (query.toLowerCase().startsWith('https://')) {
        event.preventDefault();
        const encodedUrl = encodeURIComponent(query);
        const destination = (proxyBase || '') + '/' + encodedUrl;
        window.location.href = destination;
      }
    });
  </script>
</body>
</html>`;
