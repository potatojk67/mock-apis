// RaraLabs mock API server.
// Every JSON file in /routes becomes one endpoint. No code changes needed to add a route.
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = [path.join(process.cwd(), 'routes'), path.join(__dirname, '..', 'routes')]
  .find((dir) => fs.existsSync(dir));

// Read route files on every request so edits show up without restarting (cheap at this size).
function loadRoutes() {
  if (!ROUTES_DIR) return { routes: [], broken: [] };
  const routes = [];
  const broken = [];
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    try {
      const route = JSON.parse(fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8'));
      routes.push({ ...route, file, method: (route.method || 'GET').toUpperCase() });
    } catch (err) {
      broken.push({ file, error: err.message });
    }
  }
  return { routes, broken };
}

// "/api/v1/invoices/:invoice_number" vs "/api/v1/invoices/INV-1" -> { invoice_number: "INV-1" }
function matchPath(pattern, actual) {
  const p = pattern.split('/').filter(Boolean);
  const a = actual.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

function lookup(obj, dottedKey) {
  return dottedKey.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

// Replace {{params.x}}, {{query.x}}, {{body.x}} placeholders inside the response.
function fillTemplate(value, ctx) {
  if (Array.isArray(value)) return value.map((v) => fillTemplate(v, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillTemplate(v, ctx)]));
  }
  if (typeof value !== 'string') return value;
  const whole = value.match(/^\{\{\s*(params|query|body)\.([\w.]+)\s*\}\}$/);
  if (whole) return lookup(ctx[whole[1]], whole[2]); // keep numbers as numbers
  return value.replace(/\{\{\s*(params|query|body)\.([\w.]+)\s*\}\}/g, (_, src, key) => {
    const v = lookup(ctx[src], key);
    return v == null ? '' : String(v);
  });
}

// An example matches when every value in its "when" block equals the incoming request.
function exampleMatches(when, ctx) {
  return Object.entries(when || {}).every(([src, fields]) =>
    Object.entries(fields).every(([key, expected]) => String(lookup(ctx[src], key)) === String(expected)));
}

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string' && body.trim()) {
    try { return JSON.parse(body); } catch { return { _raw: body }; }
  }
  return {};
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body, null, 2));
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.searchParams.get('__path') || url.pathname; // __path is set by the vercel.json rewrite
  url.searchParams.delete('__path');
  const method = req.method.toUpperCase();
  const { routes, broken } = loadRoutes();

  // Home page: a catalog of every mock route.
  if (pathname === '/' && method === 'GET') {
    return send(res, 200, {
      service: 'RaraLabs Mock API',
      routes: routes.map(({ method: m, path: p, name, description, file }) => ({ method: m, path: p, name, description, file })),
      broken_route_files: broken.length ? broken : undefined,
    });
  }

  let pathMatchedOtherMethod = false;
  for (const route of routes) {
    const params = matchPath(route.path || '', pathname);
    if (!params) continue;
    if (route.method !== method) { pathMatchedOtherMethod = true; continue; }

    const ctx = { params, query: Object.fromEntries(url.searchParams), body: parseBody(req.body) };

    const required = (route.request && route.request.required_fields) || [];
    const missing = required.filter((f) => [undefined, null, ''].includes(lookup(ctx.body, f)));
    if (missing.length) {
      return send(res, 400, { error: 'Missing required fields', missing_fields: missing });
    }

    const example = (route.examples || []).find((ex) => exampleMatches(ex.when, ctx));
    const response = (example && example.response) || route.response || { status: 200, body: {} };
    return send(res, response.status || 200, fillTemplate(response.body ?? {}, ctx), response.headers);
  }

  if (pathMatchedOtherMethod) {
    return send(res, 405, { error: `Method ${method} not allowed on ${pathname}` });
  }
  return send(res, 404, { error: `No mock route for ${method} ${pathname}`, hint: 'Open / to see all routes' });
};
