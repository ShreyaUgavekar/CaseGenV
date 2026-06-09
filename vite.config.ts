import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import https from 'https'
import http from 'http'

// ── Dev middleware: mirrors Supabase edge function routes ─────────────────────

// /dev-proxy/generate  →  api.meshapi.ai (streaming)
// /dev-proxy/jira-fetch  →  Jira REST API (GET)
// /dev-proxy/jira-upload  →  Jira REST API (POST attachment + comment)

function forwardRequest(
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer,
  res: import('http').ServerResponse
) {
  const parsed = new URL(targetUrl);
  const lib = parsed.protocol === 'https:' ? https : http;
  const options: https.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method,
    headers: {
      ...headers,
      ...(body.length > 0 ? { 'Content-Length': String(body.length) } : {}),
    },
  };
  const proxyReq = lib.request(options, proxyRes => {
    res.statusCode = proxyRes.statusCode ?? 200;
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (v) res.setHeader(k, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: err.message }));
  });
  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();
}

const devProxyMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.startsWith('/dev-proxy/')) return next();

  const route = req.url.split('/dev-proxy/')[1]?.split('?')[0];
  const qs = new URL(req.url, 'http://localhost').searchParams;

  res.setHeader('Access-Control-Allow-Origin', '*');

  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);

    // ── generate: proxy to Mesh API ──────────────────────────────────────────
    if (route === 'generate') {
      const meshKey = req.headers['x-mesh-key'] as string ?? '';
      forwardRequest('https://api.meshapi.ai/v1/chat/completions', 'POST', {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${meshKey}`,
        'Accept': 'text/event-stream',
      }, body, res);
      return;
    }

    // ── jira-fetch: GET Jira issue ────────────────────────────────────────────
    if (route === 'jira-fetch') {
      const issueUrl = qs.get('issueUrl') ?? '';
      const auth = req.headers['x-jira-auth'] as string ?? '';
      forwardRequest(issueUrl, 'GET', {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      }, Buffer.alloc(0), res);
      return;
    }

    // ── jira-upload: attach CSV + post comment ────────────────────────────────
    if (route === 'jira-upload') {
      try {
        const payload = JSON.parse(body.toString());
        const { baseUrl, issueKey, auth, filename, csvContent } = payload;

        // Build multipart form data manually
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
        const csvBuffer = Buffer.from(csvContent, 'utf-8');
        const parts = [
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`,
          csvBuffer,
          `\r\n--${boundary}--\r\n`,
        ];
        const formBody = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p));

        forwardRequest(`${baseUrl}/rest/api/3/issue/${issueKey}/attachments`, 'POST', {
          'Authorization': `Basic ${auth}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'X-Atlassian-Token': 'no-check',
          'Accept': 'application/json',
        }, formBody, res);
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }

    next();
  });
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dev-proxy',
      configureServer(server) {
        server.middlewares.use(devProxyMiddleware);
      },
    },
  ],
  server: {
    proxy: {
      '/mesh': {
        target: 'https://api.meshapi.ai',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/mesh/, ''),
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
})
