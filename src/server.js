const express = require('express');
const { findKey, initKeysStore } = require('./keys-store');
const { createAdminRouter, createAdminApiRouter } = require('./admin-routes');
const { handleAnthropicMessages, handleCountTokens, handleUnsupported, anthropicError } = require('./anthropic-adapter');

const app = express();

const PORT = process.env.PORT || 3000;
const DIGI_BASE_URL = process.env.DIGI_BASE_URL;
const DIGI_AUTH_TOKEN = process.env.DIGI_AUTH_TOKEN;
const PROXY_API_KEY = process.env.PROXY_API_KEY;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DIGI_BASE_URL || !DIGI_AUTH_TOKEN || !PROXY_API_KEY || !DATABASE_URL) {
  console.error('Missing required env vars: DIGI_BASE_URL, DIGI_AUTH_TOKEN, PROXY_API_KEY, DATABASE_URL');
  process.exit(1);
}

function extractClientKey(req) {
  const authorization = req.headers.authorization || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return req.headers['x-proxy-key'];
}

async function authenticateProxyKey(req, res, next) {
  const clientKey = extractClientKey(req);
  if (!clientKey) {
    return anthropicError(res, 401, 'authentication_error', 'Missing proxy token');
  }

  if (clientKey === PROXY_API_KEY) {
    req.proxyKey = {
      default_model: 'cx/gpt-5.5',
      allowed_models: ['cx/gpt-5.5', 'cx/gpt-5.4', 'cx/gpt-5.3-codex'],
      force_model: false
    };
    return next();
  }

  const key = await findKey(clientKey);
  if (!key) {
    return anthropicError(res, 401, 'authentication_error', 'Invalid proxy token');
  }

  req.proxyKey = key;
  return next();
}

function authenticateAdmin(req, res, next) {
  const username = req.headers['x-admin-username'];
  const password = req.headers['x-admin-password'];
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid admin credentials' });
  }
  return next();
}

app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/admin', createAdminRouter());
app.use('/admin', createAdminApiRouter(authenticateAdmin));
app.use('/public', express.static('public'));

app.post('/v1/messages', authenticateProxyKey, (req, res) => {
  handleAnthropicMessages(req, res, DIGI_BASE_URL, DIGI_AUTH_TOKEN);
});

app.post('/v1/messages/count_tokens', authenticateProxyKey, handleCountTokens);
app.use('/v1/files', authenticateProxyKey, handleUnsupported);
app.use('/v1', authenticateProxyKey, handleUnsupported);

async function start() {
  await initKeysStore();
  app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
    console.log(`Digi upstream configured: ${new URL(DIGI_BASE_URL).origin}`);
  });
}

start().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});
