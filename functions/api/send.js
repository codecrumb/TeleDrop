async function computeToken(env) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.PIN || ''),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(env.BOT_TOKEN || ''));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyAuth(request, env) {
  const expected = await computeToken(env);

  // Check HttpOnly cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const cm = cookieHeader.match(/(?:^|;\s*)teledrop_auth=([^;]+)/);
  if (cm && cm[1] === expected) return true;

  // Check Authorization: Bearer <token>
  const authHeader = request.headers.get('Authorization') || '';
  const am = authHeader.match(/^Bearer (.+)$/);
  if (am && am[1] === expected) return true;

  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.PIN || !env.BOT_TOKEN || !env.CHAT_ID) {
    return json({ error: 'Server not configured' }, 503);
  }

  if (!await verifyAuth(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const contentType = request.headers.get('Content-Type') || '';
  let type, content, file;

  if (contentType.includes('multipart/form-data')) {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return json({ error: 'Failed to parse form data' }, 400);
    }
    type = formData.get('type');
    file = formData.get('file');
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    type = body.type;
    content = body.content;
  }

  if (!type) {
    return json({ error: 'Missing type field' }, 400);
  }

  // File size guard (CF Pages Functions cap: 100 MB)
  if (file && file.size > 100 * 1024 * 1024) {
    return json({ error: 'File too large — maximum size is 100 MB' }, 413);
  }

  const apiBase = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
  let tgRes;

  if (type === 'image' && file) {
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('photo', file);
    tgRes = await fetch(`${apiBase}/sendPhoto`, { method: 'POST', body: fd });

  } else if (type === 'file' && file) {
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('document', file);
    tgRes = await fetch(`${apiBase}/sendDocument`, { method: 'POST', body: fd });

  } else if (type === 'text' || type === 'link') {
    if (!content || !content.trim()) {
      return json({ error: 'Missing content' }, 400);
    }
    const prefix = type === 'link' ? '🔗' : '📝';
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('text', `${prefix} ${content.trim()}`);
    tgRes = await fetch(`${apiBase}/sendMessage`, { method: 'POST', body: fd });

  } else {
    return json({ error: `Invalid send type: ${type}` }, 400);
  }

  let tgData;
  try {
    tgData = await tgRes.json();
  } catch {
    return json({ error: 'Telegram returned an unexpected response' }, 502);
  }

  if (!tgData.ok) {
    return json({ error: tgData.description || 'Telegram API error' }, 502);
  }

  return json({
    ok: true,
    messageId: tgData.result.message_id,
    chatId: env.CHAT_ID,
  });
}
