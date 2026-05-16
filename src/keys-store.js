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

function normalizeProvider(item) {
  return {
    ...item,
    base_url: String(item.base_url || '').replace(/\/$/, ''),
    created_at: item.created_at instanceof Date ? item.created_at.toISOString() : item.created_at,
    updated_at: item.updated_at instanceof Date ? item.updated_at.toISOString() : item.updated_at
  };
}

function normalizeProviderSafe(item) {
  const provider = normalizeProvider(item);
  delete provider.auth_token;
  return provider;
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value || '').trim().replace(/\/$/, '');
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Provider base URL must use http or https');
  }
  return baseUrl;
}

function normalizeKey(item) {
  const allowedModels = normalizeModelList(item.allowed_models);
  const defaultModel = item.default_model || allowedModels[0] || DEFAULT_MODEL;
  return {
    ...item,
    owner: item.owner || '',
    provider_id: item.provider_id || null,
    provider_name: item.provider_name || '',
    provider_base_url: item.provider_base_url || '',
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
      owner text NOT NULL DEFAULT '',
      default_model text NOT NULL,
      allowed_models text[] NOT NULL,
      force_model boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS providers (
      id uuid PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      base_url text NOT NULL,
      auth_token text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE proxy_keys ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE proxy_keys ADD COLUMN IF NOT EXISTS default_model text NOT NULL DEFAULT '${DEFAULT_MODEL}'`);
  await pool.query(`ALTER TABLE proxy_keys ADD COLUMN IF NOT EXISTS allowed_models text[] NOT NULL DEFAULT ARRAY['cx/gpt-5.5','cx/gpt-5.4','cx/gpt-5.3-codex']::text[]`);
  await pool.query(`ALTER TABLE proxy_keys ADD COLUMN IF NOT EXISTS force_model boolean NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE proxy_keys ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES providers(id) ON DELETE SET NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS model_prices (
      model text PRIMARY KEY,
      input_per_1m numeric NOT NULL DEFAULT 0,
      output_per_1m numeric NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS provider_model_prices (
      provider_id uuid REFERENCES providers(id) ON DELETE CASCADE,
      model text NOT NULL,
      input_per_1m numeric NOT NULL DEFAULT 0,
      output_per_1m numeric NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_id, model)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id uuid PRIMARY KEY,
      key_id uuid REFERENCES proxy_keys(id) ON DELETE SET NULL,
      provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
      owner text NOT NULL DEFAULT '',
      model text NOT NULL,
      prompt_tokens integer NOT NULL DEFAULT 0,
      completion_tokens integer NOT NULL DEFAULT 0,
      total_tokens integer NOT NULL DEFAULT 0,
      cost numeric NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES providers(id) ON DELETE SET NULL`);
}

function generateKeyValue() {
  return `pk_${crypto.randomBytes(24).toString('hex')}`;
}

async function loadKeys() {
  const result = await pool.query(`
    SELECT proxy_keys.*, providers.name AS provider_name, providers.base_url AS provider_base_url
    FROM proxy_keys
    LEFT JOIN providers ON providers.id = proxy_keys.provider_id
    ORDER BY proxy_keys.created_at DESC
  `);
  return result.rows.map(normalizeKey);
}

async function addKey(options = {}) {
  const item = normalizeKey({
    id: crypto.randomUUID(),
    key: generateKeyValue(),
    owner: String(options.owner || '').trim(),
    provider_id: options.provider_id || null,
    default_model: options.default_model || DEFAULT_MODEL,
    allowed_models: normalizeModelList(options.allowed_models),
    force_model: options.force_model !== false
  });
  const result = await pool.query(
    `INSERT INTO proxy_keys (id, key, owner, provider_id, default_model, allowed_models, force_model)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [item.id, item.key, item.owner, item.provider_id, item.default_model, item.allowed_models, item.force_model]
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
  const result = await pool.query(`
    SELECT proxy_keys.*, providers.name AS provider_name, providers.base_url AS provider_base_url
    FROM proxy_keys
    LEFT JOIN providers ON providers.id = proxy_keys.provider_id
    WHERE proxy_keys.key = $1
    LIMIT 1
  `, [input]);
  return result.rows[0] ? normalizeKey(result.rows[0]) : null;
}

async function loadProviders() {
  const result = await pool.query('SELECT * FROM providers ORDER BY created_at DESC');
  return result.rows.map(normalizeProviderSafe);
}

async function addProvider(options = {}) {
  const baseUrl = normalizeBaseUrl(options.base_url);
  const authToken = String(options.auth_token || '').trim();
  if (!authToken) {
    throw new Error('auth_token is required');
  }
  const result = await pool.query(
    `INSERT INTO providers (id, name, base_url, auth_token, updated_at)
     VALUES ($1, $2, $3, $4, now())
     RETURNING *`,
    [crypto.randomUUID(), String(options.name || '').trim(), baseUrl, authToken]
  );
  return normalizeProviderSafe(result.rows[0]);
}

async function deleteProvider(id) {
  const result = await pool.query('DELETE FROM providers WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function findProvider(id) {
  if (!id) {
    return null;
  }
  const result = await pool.query('SELECT * FROM providers WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? normalizeProvider(result.rows[0]) : null;
}

function normalizePrice(item) {
  return {
    provider_id: item.provider_id || null,
    model: item.model,
    input_per_1m: Number(item.input_per_1m || 0),
    output_per_1m: Number(item.output_per_1m || 0),
    updated_at: item.updated_at instanceof Date ? item.updated_at.toISOString() : item.updated_at
  };
}

async function loadPrices(providerId) {
  if (providerId) {
    const result = await pool.query('SELECT * FROM provider_model_prices WHERE provider_id = $1 ORDER BY model ASC', [providerId]);
    return result.rows.map(normalizePrice);
  }
  const result = await pool.query('SELECT * FROM model_prices ORDER BY model ASC');
  return result.rows.map(normalizePrice);
}

async function upsertPrice(options = {}) {
  const model = String(options.model || '').trim();
  if (!model) {
    throw new Error('model is required');
  }
  const inputPer1m = Number(options.input_per_1m || 0);
  const outputPer1m = Number(options.output_per_1m || 0);
  if (!Number.isFinite(inputPer1m) || !Number.isFinite(outputPer1m) || inputPer1m < 0 || outputPer1m < 0) {
    throw new Error('prices must be finite numbers >= 0');
  }

  if (options.provider_id) {
    const result = await pool.query(
      `INSERT INTO provider_model_prices (provider_id, model, input_per_1m, output_per_1m, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (provider_id, model) DO UPDATE SET
         input_per_1m = EXCLUDED.input_per_1m,
         output_per_1m = EXCLUDED.output_per_1m,
         updated_at = now()
       RETURNING *`,
      [options.provider_id, model, inputPer1m, outputPer1m]
    );
    return normalizePrice(result.rows[0]);
  }

  const result = await pool.query(
    `INSERT INTO model_prices (model, input_per_1m, output_per_1m, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (model) DO UPDATE SET
       input_per_1m = EXCLUDED.input_per_1m,
       output_per_1m = EXCLUDED.output_per_1m,
       updated_at = now()
     RETURNING *`,
    [model, inputPer1m, outputPer1m]
  );
  return normalizePrice(result.rows[0]);
}

async function findPrice(providerId, model) {
  if (providerId) {
    const providerResult = await pool.query(
      'SELECT * FROM provider_model_prices WHERE provider_id = $1 AND model = $2 LIMIT 1',
      [providerId, model]
    );
    if (providerResult.rows[0]) {
      return normalizePrice(providerResult.rows[0]);
    }
  }
  const result = await pool.query('SELECT * FROM model_prices WHERE model = $1 LIMIT 1', [model]);
  return result.rows[0] ? normalizePrice(result.rows[0]) : null;
}

function calculateCost(usage, price) {
  if (!price) {
    return 0;
  }
  const promptTokens = Number(usage?.prompt_tokens || 0);
  const completionTokens = Number(usage?.completion_tokens || 0);
  return (promptTokens * price.input_per_1m + completionTokens * price.output_per_1m) / 1000000;
}

async function addUsageLog(options = {}) {
  const promptTokens = Number(options.prompt_tokens || 0);
  const completionTokens = Number(options.completion_tokens || 0);
  const totalTokens = Number(options.total_tokens || promptTokens + completionTokens);
  const result = await pool.query(
    `INSERT INTO usage_logs (id, key_id, provider_id, owner, model, prompt_tokens, completion_tokens, total_tokens, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [crypto.randomUUID(), options.key_id || null, options.provider_id || null, options.owner || '', options.model || 'unknown', promptTokens, completionTokens, totalTokens, Number(options.cost || 0)]
  );
  return result.rows[0];
}

async function loadUsageSummary() {
  const result = await pool.query(`
    SELECT
      usage_logs.owner,
      usage_logs.model,
      providers.name AS provider_name,
      SUM(prompt_tokens)::bigint AS prompt_tokens,
      SUM(completion_tokens)::bigint AS completion_tokens,
      SUM(total_tokens)::bigint AS total_tokens,
      SUM(cost)::numeric AS cost,
      COUNT(*)::integer AS requests
    FROM usage_logs
    LEFT JOIN providers ON providers.id = usage_logs.provider_id
    GROUP BY usage_logs.owner, usage_logs.model, providers.name
    ORDER BY cost DESC, total_tokens DESC
  `);
  return result.rows.map((item) => ({
    owner: item.owner || '-',
    provider_name: item.provider_name || '-',
    model: item.model,
    prompt_tokens: Number(item.prompt_tokens || 0),
    completion_tokens: Number(item.completion_tokens || 0),
    total_tokens: Number(item.total_tokens || 0),
    cost: Number(item.cost || 0),
    requests: Number(item.requests || 0)
  }));
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
  DEFAULT_ALLOWED_MODELS,
  loadProviders,
  addProvider,
  deleteProvider,
  findProvider,
  normalizeBaseUrl,
  loadPrices,
  upsertPrice,
  findPrice,
  calculateCost,
  addUsageLog,
  loadUsageSummary
};
