async function verifyTurnstile(token, secretKey, ip) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: secretKey, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return data.success === true;
}

async function computeToken(env) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.PIN || ''),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(env.BOT_TOKEN || ''));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export async function onRequestGet(context) {
  return json({ turnstileSiteKey: context.env.TURNSTILE_SITE_KEY || null }, 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.PIN || !env.BOT_TOKEN || !env.CHAT_ID) {
    return json(
      { error: 'Server not configured — set BOT_TOKEN, CHAT_ID, and PIN env vars.' },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { pin, remember, cfTurnstileToken } = body;

  // Validate Turnstile challenge when the client sends one
  if (cfTurnstileToken && env.TURNSTILE_SECRET_KEY) {
    const ip = request.headers.get('cf-connecting-ip') || '';
    const valid = await verifyTurnstile(cfTurnstileToken, env.TURNSTILE_SECRET_KEY, ip);
    if (!valid) {
      return json({ error: 'Security check failed — please try again' }, 403);
    }
  }

  // Always compute token (avoids trivial timing oracle on missing PIN field)
  const token = await computeToken(env);

  if (!pin || pin !== env.PIN) {
    return json({ error: 'Incorrect PIN' }, 401);
  }

  const extraHeaders = {};
  if (remember) {
    extraHeaders['Set-Cookie'] =
      `teledrop_auth=${token}; Path=/; Max-Age=2592000; SameSite=Strict`;
  }

  return json({ ok: true, token }, 200, extraHeaders);
}
