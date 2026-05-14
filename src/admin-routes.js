const express = require('express');
const path = require('path');
const { loadKeys, addKey, deleteKey, DEFAULT_ALLOWED_MODELS } = require('./keys-store');

function createAdminRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
  });

  return router;
}

function createAdminApiRouter(authenticateAdmin) {
  const router = express.Router();

  router.get('/keys', authenticateAdmin, async (req, res) => {
    const keys = await loadKeys();
    const safe = keys.map((item) => ({
      id: item.id,
      key: item.key,
      created_at: item.created_at,
      preview: `${item.key.slice(0, 8)}...${item.key.slice(-6)}`,
      default_model: item.default_model,
      allowed_models: item.allowed_models,
      force_model: item.force_model
    }));
    res.json({ keys: safe, default_allowed_models: DEFAULT_ALLOWED_MODELS });
  });

  router.post('/keys', authenticateAdmin, async (req, res) => {
    const created = await addKey(req.body || {});
    res.status(201).json({
      id: created.id,
      key: created.key,
      created_at: created.created_at,
      default_model: created.default_model,
      allowed_models: created.allowed_models,
      force_model: created.force_model
    });
  });

  router.delete('/keys/:id', authenticateAdmin, async (req, res) => {
    const ok = await deleteKey(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Not Found', message: 'Key id does not exist' });
    }
    res.status(204).send();
  });

  return router;
}

module.exports = { createAdminRouter, createAdminApiRouter };
