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

  const { pin, remember } = body;

  // Always compute token (avoids trivial timing oracle on missing PIN field)
  const token = await computeToken(env);

  if (!pin || pin !== env.PIN) {
    return json({ error: 'Incorrect PIN' }, 401);
  }

  const extraHeaders = {};
  if (remember) {
    extraHeaders['Set-Cookie'] =
      `teledrop_auth=${token}; Path=/; Max-Age=2592000; SameSite=Strict; HttpOnly`;
  }

  return json({ ok: true, token }, 200, extraHeaders);
}
