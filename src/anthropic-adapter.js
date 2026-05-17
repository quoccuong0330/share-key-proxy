const axios = require('axios');
const { findPrice, calculateCost, addUsageLog } = require('./keys-store');

function anthropicError(res, status, type, message) {
  return res.status(status).json({ type: 'error', error: { type, message } });
}

function applyModelPolicy(body, policy) {
  const next = { ...body };
  if (policy.force_model) {
    next.model = policy.default_model;
    return { ok: true, body: next };
  }

  const requested = next.model || policy.default_model;
  if (!policy.allowed_models.includes(requested)) {
    return { ok: false, message: `Model not allowed: ${requested}` };
  }

  next.model = requested;
  return { ok: true, body: next };
}

function mapAnthropicToOpenAI(anthropicBody) {
  const { model, messages, max_tokens, temperature, system, stream } = anthropicBody;
  const openaiMessages = [];

  if (system) {
    openaiMessages.push({ role: 'system', content: system });
  }

  for (const msg of messages || []) {
    if (typeof msg.content === 'string') {
      openaiMessages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter((item) => item.type === 'text').map((item) => item.text);
      openaiMessages.push({ role: msg.role, content: textParts.join('\n') });
    }
  }

  return {
    model,
    messages: openaiMessages,
    max_tokens: max_tokens || 1024,
    temperature: temperature !== undefined ? temperature : 1,
    stream: Boolean(stream)
  };
}

function mapOpenAIToAnthropic(openaiResponse) {
  const choice = openaiResponse.choices?.[0];
  const usage = {
    input_tokens: openaiResponse.usage?.prompt_tokens || 0,
    output_tokens: openaiResponse.usage?.completion_tokens || 0
  };
  if (!choice) {
    return {
      id: openaiResponse.id || 'msg_unknown',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: openaiResponse.model || 'unknown',
      stop_reason: 'end_turn',
      usage
    };
  }

  return {
    id: openaiResponse.id || 'msg_unknown',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: choice.message?.content || '' }],
    model: openaiResponse.model || 'unknown',
    stop_reason: choice.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0
    }
  };
}

function mapFinishReason(reason) {
  if (reason === 'length') {
    return 'max_tokens';
  }
  return 'end_turn';
}

function writeAnthropicSse(res, event, data) {
  if (res.writableEnded || res.destroyed) {
    return;
  }
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function startAnthropicSse(res, messageId, model) {
  writeAnthropicSse(res, 'message_start', {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    }
  });
  writeAnthropicSse(res, 'content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' }
  });
}

function stopAnthropicSse(res, usage = {}, stopReason = 'end_turn') {
  writeAnthropicSse(res, 'content_block_stop', {
    type: 'content_block_stop',
    index: 0
  });
  writeAnthropicSse(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: usage.completion_tokens || 0 }
  });
  writeAnthropicSse(res, 'message_stop', { type: 'message_stop' });
  if (!res.writableEnded && !res.destroyed) {
    res.end();
  }
}

function pipeOpenAIStreamToAnthropic(response, res, fallbackModel) {
  res.status(response.status);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let buffer = '';
  let messageStarted = false;
  let stopped = false;
  let messageId = `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let model = fallbackModel;
  let usage = {};
  let stopReason = 'end_turn';

  function ensureStarted() {
    if (!messageStarted) {
      messageStarted = true;
      startAnthropicSse(res, messageId, model);
    }
  }

  function stopOnce() {
    if (!stopped) {
      stopped = true;
      ensureStarted();
      stopAnthropicSse(res, usage, stopReason);
    }
  }

  response.data.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }

      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') {
        stopOnce();
        return;
      }

      try {
        const json = JSON.parse(payload);
        messageId = json.id || messageId;
        model = json.model || model;
        ensureStarted();

        const choice = json.choices?.[0];
        const text = choice?.delta?.content;
        if (text !== undefined) {
          writeAnthropicSse(res, 'content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text }
          });
        }

        if (choice?.finish_reason) {
          stopReason = mapFinishReason(choice.finish_reason);
        }
        if (json.usage) {
          usage = json.usage;
        }
      } catch (error) {
        console.error('OpenAI stream parse error:', error.message);
        writeAnthropicSse(res, 'error', {
          type: 'error',
          error: { type: 'api_error', message: 'Upstream stream parse failed' }
        });
        if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
        response.data.destroy();
        return;
      }
    }
  });

  response.data.on('end', () => stopOnce());
  response.data.on('error', (error) => {
    console.error('OpenAI stream error:', error.message);
    if (!stopped) {
      stopped = true;
      writeAnthropicSse(res, 'error', {
        type: 'error',
        error: { type: 'api_error', message: 'Upstream stream failed' }
      });
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
  });
}

async function handleAnthropicMessages(req, res, upstream) {
  try {
    const policyResult = applyModelPolicy(req.body || {}, req.proxyKey);
    if (!policyResult.ok) {
      return anthropicError(res, 400, 'invalid_request_error', policyResult.message);
    }

    const openaiPayload = mapAnthropicToOpenAI(policyResult.body);
    const response = await axios.post(
      `${upstream.base_url.replace(/\/$/, '')}/chat/completions`,
      openaiPayload,
      {
        headers: {
          Authorization: `Bearer ${upstream.auth_token}`,
          'Content-Type': 'application/json'
        },
        responseType: openaiPayload.stream ? 'stream' : 'json',
        timeout: 300000
      }
    );

    if (openaiPayload.stream) {
      pipeOpenAIStreamToAnthropic(response, res, openaiPayload.model);
      req.on('close', () => response.data.destroy());
      return;
    }

    const anthropicResponse = mapOpenAIToAnthropic(response.data);
    const usage = response.data.usage || {};
    const price = await findPrice(upstream.id, response.data.model || openaiPayload.model);
    const cost = calculateCost(usage, price);
    await addUsageLog({
      key_id: req.proxyKey.id,
      provider_id: upstream.id,
      owner: req.proxyKey.owner,
      model: response.data.model || openaiPayload.model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      cost
    });
    res.json(anthropicResponse);
  } catch (error) {
    console.error('Anthropic messages proxy error:', error.message);

    if (error.response && !error.response.data?.pipe) {
      return anthropicError(
        res,
        error.response.status,
        'api_error',
        error.response.data?.error?.message || error.message
      );
    }

    return anthropicError(res, 502, 'api_error', 'Upstream service unavailable');
  }
}

function handleUnsupported(req, res) {
  return anthropicError(res, 501, 'not_supported_error', `${req.path} is not supported by this proxy`);
}

function handleCountTokens(req, res) {
  return anthropicError(res, 501, 'not_supported_error', 'Token counting is not supported by this proxy yet');
}

module.exports = { handleAnthropicMessages, handleCountTokens, handleUnsupported, anthropicError };
