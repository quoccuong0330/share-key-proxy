const crypto = require('crypto');
const { Pool } = require('pg');

const DEFAULT_MODEL = 'cx/gpt-5.5';
const DEFAULT_ALLOWED_MODELS = ['cx/gpt-5.5', 'cx/gpt-5.4', 'cx/gpt-5.3-codex'];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function normalizeModelList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_MODELS;
}

function normalizeKey(item) {
  const allowedModels = normalizeModelList(item.allowed_models);
  const defaultModel = item.default_model || allowedModels[0] || DEFAULT_MODEL;
  return {
    ...item,
    default_model: defaultModel,
    allowed_models: allowedModels.includes(defaultModel) ? allowedModels : [defaultModel, ...allowedModels],
    force_model: item.force_model !== false,
    created_at: item.created_at instanceof Date ? item.created_at.toISOString() : item.created_at
  };
}

async function initKeysStore() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS proxy_keys (
      id uuid PRIMARY KEY,
      key text NOT NULL UNIQUE,
      default_model text NOT NULL,
      allowed_models text[] NOT NULL,
      force_model boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function generateKeyValue() {
  return `pk_${crypto.randomBytes(24).toString('hex')}`;
}

async function loadKeys() {
  const result = await pool.query('SELECT * FROM proxy_keys ORDER BY created_at DESC');
  return result.rows.map(normalizeKey);
}

async function addKey(options = {}) {
  const item = normalizeKey({
    id: crypto.randomUUID(),
    key: generateKeyValue(),
    default_model: options.default_model || DEFAULT_MODEL,
    allowed_models: normalizeModelList(options.allowed_models),
    force_model: options.force_model !== false
  });
  const result = await pool.query(
    `INSERT INTO proxy_keys (id, key, default_model, allowed_models, force_model)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [item.id, item.key, item.default_model, item.allowed_models, item.force_model]
  );
  return normalizeKey(result.rows[0]);
}

async function deleteKey(id) {
  const result = await pool.query('DELETE FROM proxy_keys WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function findKey(input) {
  if (!input) {
    return null;
  }
  const result = await pool.query('SELECT * FROM proxy_keys WHERE key = $1 LIMIT 1', [input]);
  return result.rows[0] ? normalizeKey(result.rows[0]) : null;
}

async function isValidKey(input) {
  return Boolean(await findKey(input));
}

module.exports = {
  initKeysStore,
  loadKeys,
  addKey,
  deleteKey,
  findKey,
  isValidKey,
  DEFAULT_MODEL,
  DEFAULT_ALLOWED_MODELS
};
