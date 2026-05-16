const express = require('express');
const path = require('path');
const axios = require('axios');
const {
  loadKeys,
  addKey,
  deleteKey,
  loadProviders,
  addProvider,
  deleteProvider,
  findProvider,
  normalizeBaseUrl,
  DEFAULT_ALLOWED_MODELS,
  loadPrices,
  upsertPrice,
  loadUsageSummary
} = require('./keys-store');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function fetchProviderModels(baseUrl, authToken) {
  return axios.get(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: { Authorization: `Bearer ${authToken}` },
    timeout: 30000
  });
}

function createAdminRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
  });

  return router;
}

function createAdminApiRouter(authenticateAdmin) {
  const router = express.Router();

  router.get('/keys', authenticateAdmin, asyncHandler(async (req, res) => {
    const keys = await loadKeys();
    const safe = keys.map((item) => ({
      id: item.id,
      key: item.key,
      owner: item.owner,
      provider_id: item.provider_id,
      provider_name: item.provider_name,
      provider_base_url: item.provider_base_url,
      created_at: item.created_at,
      preview: `${item.key.slice(0, 8)}...${item.key.slice(-6)}`,
      default_model: item.default_model,
      allowed_models: item.allowed_models,
      force_model: item.force_model
    }));
    res.json({ keys: safe, default_allowed_models: DEFAULT_ALLOWED_MODELS });
  }));

  router.post('/keys', authenticateAdmin, asyncHandler(async (req, res) => {
    const created = await addKey(req.body || {});
    res.status(201).json({
      id: created.id,
      key: created.key,
      owner: created.owner,
      provider_id: created.provider_id,
      provider_name: created.provider_name,
      provider_base_url: created.provider_base_url,
      created_at: created.created_at,
      default_model: created.default_model,
      allowed_models: created.allowed_models,
      force_model: created.force_model
    });
  }));

  router.delete('/keys/:id', authenticateAdmin, asyncHandler(async (req, res) => {
    const ok = await deleteKey(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Not Found', message: 'Key id does not exist' });
    }
    res.status(204).send();
  }));

  router.get('/providers', authenticateAdmin, asyncHandler(async (req, res) => {
    res.json({ providers: await loadProviders() });
  }));

  router.post('/providers/validate', authenticateAdmin, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const response = await fetchProviderModels(body.base_url, body.auth_token);
    res.json({ ok: true, models: response.data?.data || [], raw: response.data });
  }));

  router.post('/providers', authenticateAdmin, asyncHandler(async (req, res) => {
    const body = req.body || {};
    await fetchProviderModels(body.base_url, body.auth_token);
    const provider = await addProvider(body);
    res.status(201).json({ provider });
  }));

  router.delete('/providers/:id', authenticateAdmin, asyncHandler(async (req, res) => {
    const ok = await deleteProvider(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Not Found', message: 'Provider id does not exist' });
    }
    res.status(204).send();
  }));

  router.get('/providers/:id/models', authenticateAdmin, asyncHandler(async (req, res) => {
    const provider = await findProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: 'Not Found', message: 'Provider id does not exist' });
    }
    const response = await fetchProviderModels(provider.base_url, provider.auth_token);
    res.json(response.data);
  }));

  router.get('/prices', authenticateAdmin, asyncHandler(async (req, res) => {
    res.json({ prices: await loadPrices(req.query.provider_id) });
  }));

  router.post('/prices', authenticateAdmin, asyncHandler(async (req, res) => {
    const price = await upsertPrice(req.body || {});
    res.status(201).json({ price });
  }));

  router.get('/usage', authenticateAdmin, asyncHandler(async (req, res) => {
    res.json({ usage: await loadUsageSummary() });
  }));

  router.get('/models', authenticateAdmin, asyncHandler(async (req, res) => {
    const provider = await findProvider(req.query.provider_id);
    if (!provider) {
      return res.status(404).json({ error: 'Not Found', message: 'Provider id does not exist' });
    }
    const response = await fetchProviderModels(provider.base_url, provider.auth_token);
    res.json(response.data);
  }));

  router.use((error, req, res, next) => {
    console.error('Admin API error:', error.message);
    res.status(400).json({ error: 'Bad Request', message: error.message });
  });

  return router;
}

module.exports = { createAdminRouter, createAdminApiRouter };
