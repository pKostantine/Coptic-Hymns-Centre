const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function requireEnv(env) {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[key]) throw new Error(`Missing required Worker binding: ${key}`);
  }
}

async function rpc(env, name, body = {}) {
  requireEnv(env);
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase RPC ${name} failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function expoHeaders(env) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
  };
}

function retryDelay(response, fallback = 60) {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : fallback;
}

function ticketOutcome(delivery, ticket) {
  if (ticket?.status === 'ok' && ticket.id) {
    return { delivery_id: delivery.delivery_id, result: 'accepted', ticket_id: ticket.id };
  }

  const code = ticket?.details?.error;
  const message = ticket?.message || code || 'Expo rejected the notification.';
  if (code === 'DeviceNotRegistered') {
    return { delivery_id: delivery.delivery_id, result: 'disabled', error: message };
  }
  if (code === 'MessageRateExceeded') {
    return { delivery_id: delivery.delivery_id, result: 'retry', error: message, retry_after_seconds: 300 };
  }
  return { delivery_id: delivery.delivery_id, result: 'failed', error: message };
}

async function dispatchQueued(env) {
  const deliveries = await rpc(env, 'claim_notification_deliveries', { p_limit: 100 }) || [];
  if (!deliveries.length) return { claimed: 0, accepted: 0 };

  const messages = deliveries.map((delivery) => ({
    to: delivery.push_token,
    title: delivery.title,
    body: delivery.body,
    sound: 'default',
    priority: 'high',
    channelId: 'chc-default',
    data: {
      ...(delivery.payload || {}),
      ...(delivery.image_url ? { image_url: delivery.image_url } : {}),
    },
  }));

  let response;
  try {
    response = await fetch(EXPO_SEND_URL, {
      method: 'POST',
      headers: expoHeaders(env),
      body: JSON.stringify(messages),
    });
  } catch (error) {
    const results = deliveries.map((delivery) => ({
      delivery_id: delivery.delivery_id,
      result: 'retry',
      error: error instanceof Error ? error.message : String(error),
      retry_after_seconds: 60,
    }));
    await rpc(env, 'complete_notification_deliveries', { p_results: results });
    return { claimed: deliveries.length, accepted: 0, retried: deliveries.length };
  }

  if (!response.ok) {
    const error = await response.text();
    const retry = response.status === 429 || response.status >= 500;
    const results = deliveries.map((delivery) => ({
      delivery_id: delivery.delivery_id,
      result: retry ? 'retry' : 'failed',
      error: `Expo Push API ${response.status}: ${error.slice(0, 1000)}`,
      retry_after_seconds: retryDelay(response),
    }));
    await rpc(env, 'complete_notification_deliveries', { p_results: results });
    return { claimed: deliveries.length, accepted: 0, retried: retry ? deliveries.length : 0 };
  }

  const payload = await response.json();
  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  const results = deliveries.map((delivery, index) => ticketOutcome(
    delivery,
    tickets[index] || { status: 'error', message: 'Expo did not return a ticket for this message.' },
  ));

  await rpc(env, 'complete_notification_deliveries', { p_results: results });
  return {
    claimed: deliveries.length,
    accepted: results.filter((result) => result.result === 'accepted').length,
    disabled: results.filter((result) => result.result === 'disabled').length,
    failed: results.filter((result) => result.result === 'failed').length,
  };
}

function receiptOutcome(delivery, receipt) {
  if (receipt?.status === 'ok') {
    return { delivery_id: delivery.delivery_id, result: 'delivered' };
  }
  const code = receipt?.details?.error;
  const message = receipt?.message || code || 'Expo delivery receipt reported an error.';
  if (code === 'DeviceNotRegistered') {
    return { delivery_id: delivery.delivery_id, result: 'disabled', error: message };
  }
  return { delivery_id: delivery.delivery_id, result: 'failed', error: message };
}

async function checkReceipts(env) {
  const deliveries = await rpc(env, 'claim_notification_receipts', { p_limit: 1000 }) || [];
  if (!deliveries.length) return { checked: 0 };

  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: expoHeaders(env),
    body: JSON.stringify({ ids: deliveries.map((delivery) => delivery.provider_ticket_id) }),
  });

  if (!response.ok) {
    // Receipt rows remain accepted and become eligible for another check after
    // the database backoff window. Do not turn a temporary Expo outage into a failure.
    return { checked: 0, deferred: deliveries.length, status: response.status };
  }

  const payload = await response.json();
  const receipts = payload?.data || {};
  const results = [];

  for (const delivery of deliveries) {
    const receipt = receipts[delivery.provider_ticket_id];
    if (!receipt) continue;
    results.push(receiptOutcome(delivery, receipt));
  }

  if (results.length) {
    await rpc(env, 'complete_notification_receipts', { p_results: results });
  }

  return {
    checked: results.length,
    delivered: results.filter((result) => result.result === 'delivered').length,
    disabled: results.filter((result) => result.result === 'disabled').length,
    failed: results.filter((result) => result.result === 'failed').length,
  };
}

async function runOnce(env) {
  const dispatch = await dispatchQueued(env);
  const receipts = await checkReceipts(env);
  return { dispatch, receipts, ran_at: new Date().toISOString() };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runOnce(env).catch((error) => {
      console.error('CHC notification dispatcher failed:', error);
    }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'chc-notification-dispatcher' });
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      const expected = env.NOTIFICATION_WORKER_SECRET;
      const supplied = request.headers.get('authorization');
      if (!expected || supplied !== `Bearer ${expected}`) {
        return json({ error: 'Unauthorized' }, 401);
      }
      try {
        return json(await runOnce(env));
      } catch (error) {
        console.error(error);
        return json({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
