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

function clientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '';
}

function ipSpoiler(request) {
  const ip = clientIp(request);
  return ip ? `\n<tg-spoiler>📍 ${escapeHtml(ip)}</tg-spoiler>` : '';
}

// Telegram's sendMessage carries at most 4096 characters of parsed text;
// sendRichMessage (rich messages: headings, lists, code, tables…) allows 32768.
// Anything longer than that goes out as a note.txt document.
const SEND_TEXT_MAX = 4096;
const RICH_TEXT_MAX = 32768;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.PIN || !env.BOT_TOKEN || !env.CHAT_ID) {
    return json({ error: 'Server not configured' }, 503);
  }

  if (!await verifyAuth(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const contentType = request.headers.get('Content-Type') || '';
  let type, content, file, caption = '', silent = false, formData, body;
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

  } else if (type === 'video' && file) {
    const cap = [caption.trim(), spoiler.trim()].filter(Boolean).join('\n');
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('video', file);
    fd.append('supports_streaming', 'true');
    if (silent) fd.append('disable_notification', 'true');
    if (cap) { fd.append('caption', cap); fd.append('parse_mode', 'HTML'); }
    tgRes = await fetch(`${apiBase}/sendVideo`, { method: 'POST', body: fd });

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
    content = content.trim();
    const prefix = type === 'link' ? '🔗' : '📝';
    const ip = clientIp(request);
    // Telegram limits count the parsed text, not HTML tags — compare against that.
    const plainLength = `${prefix} ${content}`.length + (ip ? `\n📍 ${ip}`.length : 0);
    const body = `${prefix} ${escapeHtml(content)}`;

    if (plainLength <= SEND_TEXT_MAX) {
      const fd = new FormData();
      fd.append('chat_id', env.CHAT_ID);
      // User text is escaped: parse_mode HTML would choke on a stray < or &.
      let text = body;
      if (ip) text += `\n<tg-spoiler>📍 ${escapeHtml(ip)}</tg-spoiler>`;
      fd.append('text', text);
      fd.append('parse_mode', 'HTML');
      if (silent) fd.append('disable_notification', 'true');
      tgRes = await fetch(`${apiBase}/sendMessage`, { method: 'POST', body: fd });

    } else if (plainLength <= RICH_TEXT_MAX) {
      // Rich messages carry up to 32768 characters — no need to split the note.
      let html = `<p>${body}</p>`;
      if (ip) html += `<p><tg-spoiler>📍 ${escapeHtml(ip)}</tg-spoiler></p>`;
      const payload = { chat_id: env.CHAT_ID, rich_message: { html } };
      if (silent) payload.disable_notification = true;
      tgRes = await fetch(`${apiBase}/sendRichMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    } else {
      // Extremely long: deliver the text as a .txt document instead.
      const base = type === 'link' ? 'link' : 'note';
      const cap = [`${prefix} Text note — ${content.length.toLocaleString('en-US')} characters, too long for a message. Full text: ${base}.txt`, spoiler.trim()].filter(Boolean).join('\n');
      const fd = new FormData();
      fd.append('chat_id', env.CHAT_ID);
      fd.append('document', new Blob([content], { type: 'text/plain' }), `${base}.txt`);
      if (silent) fd.append('disable_notification', 'true');
      if (cap) { fd.append('caption', cap); fd.append('parse_mode', 'HTML'); }
      tgRes = await fetch(`${apiBase}/sendDocument`, { method: 'POST', body: fd });
    }

  } else if (type === 'rejoin') {
    // After a split file: one worker-built message telling future-you how to
    // reassemble it. Commands are <code> spans, which Telegram renders as
    // monospace with tap-to-copy — not a "text note", so no 📝 prefix.
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const parts = Number.isInteger(body.parts) && body.parts >= 1 && body.parts <= 99 ? body.parts : 0;
    if (!name || name.length > 255 || !parts) return json({ error: 'Invalid rejoin parameters' }, 400);
    if (body.replyTo !== undefined && (!Number.isInteger(body.replyTo) || body.replyTo <= 0)) {
      return json({ error: 'Invalid rejoin parameters' }, 400);
    }
    const width = String(parts).length;
    const part = i => `${name}.part${String(i + 1).padStart(width, '0')}`;
    // Escape for double-quoted shell strings ($ ` " \), so an odd file name
    // can't execute or break the command the user pastes.
    const q = s => `"${s.replace(/([$`"\\])/g, '\\$1')}"`;
    const names = Array.from({ length: parts }, (_, i) => part(i));
    const cat = `cat ${names.map(q).join(' ')} > ${q(name)}`;
    const copy = `copy /b ${names.map(q).join('+')} ${q(name)}`;
    const fd = new FormData();
    fd.append('chat_id', env.CHAT_ID);
    fd.append('text',
      `🧩 ${escapeHtml(name)} was sent in ${parts} part${parts === 1 ? '' : 's'}. Rejoin the original file with:\n`
      + `macOS/Linux: <code>${escapeHtml(cat)}</code>\n`
      + `Windows: <code>${escapeHtml(copy)}</code>`
      + ipSpoiler(request));
    fd.append('parse_mode', 'HTML');
    // Reply to the last part so the instructions stay attached to the file.
    if (Number.isInteger(body.replyTo) && body.replyTo > 0) {
      fd.append('reply_parameters', JSON.stringify({ message_id: body.replyTo }));
    }
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
      const mediaType = formData.get(`type${i}`) === 'video' ? 'video' : 'photo';
      const mediaObj = { type: mediaType, media: `attach://${attachKey}` };
      if (mediaType === 'video') mediaObj.supports_streaming = true;
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
