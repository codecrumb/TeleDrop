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

  const cookieHeader = request.headers.get('Cookie') || '';
  const cm = cookieHeader.match(/(?:^|;\s*)teledrop_auth=([^;]+)/);
  if (cm && cm[1] === expected) return true;

  const authHeader = request.headers.get('Authorization') || '';
  const am = authHeader.match(/^Bearer (.+)$/);
  return am ? am[1] === expected : false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ipSpoiler(request) {
  const ip = request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '';
  return ip ? `\n<tg-spoiler>📍 ${escapeHtml(ip)}</tg-spoiler>` : '';
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
  let type, content, file, caption = '', silent = false, formData;
  let isAlbum = false;

  if (contentType.includes('multipart/form-data')) {
    try {
      formData = await request.formData();
    } catch {
      return json({ error: 'Failed to parse form data' }, 400);
    }
    type = formData.get('type');
    file = formData.get('file');
    caption = formData.get('caption') || '';
    silent = formData.get('silent') === 'true';
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    type = body.type;
    content = body.content;
    caption = body.caption || '';
    silent = body.silent === true;
  }

  if (!type) return json({ error: 'Missing type field' }, 400);

  if (file && file.size > 100 * 1024 * 1024) {
    return json({ error: 'File too large — maximum size is 100 MB' }, 413);
  }

  const spoiler = ipSpoiler(request);
  const apiBase = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
  let tgRes;

  if (type === 'image' && file) {
    const cap = [caption.trim(), spoiler.trim()].filter(Boolean).join('\n');
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('photo', file);
    if (silent) fd.append('disable_notification', 'true');
    if (cap) { fd.append('caption', cap); fd.append('parse_mode', 'HTML'); }
    tgRes = await fetch(`${apiBase}/sendPhoto`, { method: 'POST', body: fd });

  } else if (type === 'file' && file) {
    const cap = [caption.trim(), spoiler.trim()].filter(Boolean).join('\n');
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('document', file);
    if (silent) fd.append('disable_notification', 'true');
    if (cap) { fd.append('caption', cap); fd.append('parse_mode', 'HTML'); }
    tgRes = await fetch(`${apiBase}/sendDocument`, { method: 'POST', body: fd });

  } else if (type === 'text' || type === 'link') {
    if (!content || !content.trim()) return json({ error: 'Missing content' }, 400);
    const prefix = type === 'link' ? '🔗' : '📝';
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('text', `${prefix} ${content.trim()}${spoiler}`);
    fd.append('parse_mode', 'HTML');
    if (silent) fd.append('disable_notification', 'true');
    tgRes = await fetch(`${apiBase}/sendMessage`, { method: 'POST', body: fd });

  } else if (type === 'album') {
    isAlbum = true;
    const mediaItems = [];
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    if (silent) fd.append('disable_notification', 'true');

    let i = 0;
    while (true) {
      const f = formData.get(`file${i}`);
      if (!f) break;
      const attachKey = `file${i}`;
      fd.append(attachKey, f);
      const mediaObj = { type: 'photo', media: `attach://${attachKey}` };
      if (i === 0) {
        const cap = [caption.trim(), spoiler.trim()].filter(Boolean).join('\n');
        if (cap) { mediaObj.caption = cap; mediaObj.parse_mode = 'HTML'; }
      }
      mediaItems.push(mediaObj);
      i++;
    }

    if (mediaItems.length === 0) return json({ error: 'No files provided for album' }, 400);

    fd.append('media', JSON.stringify(mediaItems));
    tgRes = await fetch(`${apiBase}/sendMediaGroup`, { method: 'POST', body: fd });

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

  const msgId = isAlbum ? tgData.result[0].message_id : tgData.result.message_id;
  return json({ ok: true, messageId: msgId, chatId: env.CHAT_ID });
}
