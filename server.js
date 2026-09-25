// AKMA Automation – zero-dependency Node HTTP server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { store } from './src/store.js';
import { createClient, runWorkflow, validate, events, STEPS } from './src/workflow.js';
import { aiProvider } from './src/ai.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.resolve('public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw Object.assign(new Error('Payload too large'), { code: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { code: 400 });
  }
}

function summary(r) {
  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    businessName: r.client.businessName,
    industry: r.client.industry,
    wilaya: r.client.wilaya,
    budget: r.client.budget,
    readinessScore: r.results?.core?.readinessScore ?? null,
    stage: r.results?.core?.businessStage ?? null,
    progress: Math.round((r.steps.filter((s) => s.status === 'done').length / r.steps.length) * 100),
  };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const [, resource, id, action] = parts;

  if (resource === 'health') return json(res, 200, { ok: true, provider: aiProvider(), steps: STEPS });

  if (resource === 'stats' && req.method === 'GET') {
    const all = store.all();
    const done = all.filter((r) => r.status === 'completed');
    const avg = done.length
      ? Math.round(done.reduce((s, r) => s + (r.results.core?.readinessScore || 0), 0) / done.length)
      : 0;
    return json(res, 200, {
      total: all.length,
      completed: done.length,
      running: all.filter((r) => r.status === 'running' || r.status === 'queued').length,
      failed: all.filter((r) => r.status === 'failed').length,
      avgReadiness: avg,
      totalBudget: all.reduce((s, r) => s + (r.client.budget || 0), 0),
      provider: aiProvider(),
    });
  }

  if (resource === 'events' && req.method === 'GET') {
    // Server-Sent Events stream for live dashboard updates
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const onUpdate = (rec) => rec && res.write(`data: ${JSON.stringify(summary(rec))}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    events.on('update', onUpdate);
    req.on('close', () => {
      clearInterval(ping);
      events.off('update', onUpdate);
    });
    return;
  }

  if (resource === 'clients') {
    if (!id && req.method === 'GET') return json(res, 200, store.all().map(summary));
    if (!id && req.method === 'POST') {
      const body = await readBody(req);
      const errors = validate(body);
      if (Object.keys(errors).length) return json(res, 422, { error: 'Validation failed', errors });
      const rec = createClient(body);
      return json(res, 201, rec);
    }
    const rec = id && store.get(id);
    if (!rec) return json(res, 404, { error: 'Client not found' });
    if (!action && req.method === 'GET') return json(res, 200, rec);
    if (!action && req.method === 'DELETE') {
      store.remove(id);
      return json(res, 200, { ok: true });
    }
    if (action === 'rerun' && req.method === 'POST') {
      runWorkflow(id).catch(console.error);
      return json(res, 202, { ok: true });
    }
  }
  return json(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    json(res, err.code && Number.isInteger(err.code) ? err.code : 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AKMA Automation running on http://${HOST}:${PORT}  (AI: ${aiProvider()})`);
});
