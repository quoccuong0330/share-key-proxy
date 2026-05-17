const axios = require('axios');

function openAIError(res, status, type, message) {
  return res.status(status).json({ error: { type, message } });
}

function applyModelPolicy(body, policy) {
  const next = { ...body };
  const allowedModels = Array.isArray(policy.allowed_models) ? policy.allowed_models : [];
  if (policy.force_model) {
    next.model = policy.default_model;
    return { ok: true, body: next };
  }

  const requested = next.model || policy.default_model;
  if (!allowedModels.includes(requested)) {
    return { ok: false, message: `Model not allowed: ${requested}` };
  }

  next.model = requested;
  return { ok: true, body: next };
}

function pipeUpstreamStream(req, res, response) {
  res.status(response.status);
  res.setHeader('Content-Type', response.headers['content-type'] || 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', response.headers['cache-control'] || 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  response.data.pipe(res);
  req.on('close', () => response.data.destroy());
}

async function handleOpenAIChatCompletions(req, res, upstream) {
  try {
    const policyResult = applyModelPolicy(req.body || {}, req.proxyKey);
    if (!policyResult.ok) {
      return openAIError(res, 400, 'invalid_request_error', policyResult.message);
    }

    const payload = policyResult.body;
    const response = await axios.post(
      `${upstream.base_url.replace(/\/$/, '')}/chat/completions`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${upstream.auth_token}`,
          'Content-Type': 'application/json'
        },
        responseType: payload.stream ? 'stream' : 'json',
        timeout: 300000
      }
    );

    if (payload.stream) {
      pipeUpstreamStream(req, res, response);
      return;
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('OpenAI chat completions proxy error:', error.message);
    if (error.response) {
      if (error.response.data?.pipe) {
        res.status(error.response.status);
        res.setHeader('Content-Type', error.response.headers?.['content-type'] || 'application/json');
        error.response.data.pipe(res);
        return;
      }
      return res.status(error.response.status).json(error.response.data);
    }
    return openAIError(res, 502, 'api_error', 'Upstream service unavailable');
  }
}

async function handleOpenAIModels(req, res, upstream) {
  try {
    const response = await axios.get(`${upstream.base_url.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${upstream.auth_token}` },
      timeout: 30000
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('OpenAI models proxy error:', error.message);
    if (error.response && !error.response.data?.pipe) {
      return res.status(error.response.status).json(error.response.data);
    }
    return openAIError(res, 502, 'api_error', 'Upstream service unavailable');
  }
}

module.exports = { handleOpenAIChatCompletions, handleOpenAIModels };
