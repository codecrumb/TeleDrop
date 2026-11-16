import assert from 'assert';

// TeleDrop sends one of three ways depending on text length:
// <= 4096 parsed characters -> sendMessage (as before)
// <= 32768 -> sendRichMessage (rich messages, up to 32768 chars)
// longer   -> sendDocument with note.txt / link.txt
describe('text notes: sendMessage / sendRichMessage / .txt document', function () {
  let onRequestPost, calls, env, token;

  before(async function () {
    ({ onRequestPost } = await import('../functions/api/send.js'));
    // Same HMAC token the auth code expects: HMAC(PIN, BOT_TOKEN), base64.
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode('1234'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode('BOTTOKEN'));
    token = btoa(String.fromCharCode(...new Uint8Array(sig)));
  });

  beforeEach(function () {
    calls = [];
    env = { PIN: '1234', BOT_TOKEN: 'BOTTOKEN', CHAT_ID: '-100123' };
    global.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return Response.json({ ok: true, result: { message_id: 42 } });
    };
  });

  afterEach(function () { global.fetch = undefined; });

  function post(body, ip) {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    if (ip) headers['cf-connecting-ip'] = ip;
    return onRequestPost({
      request: new Request('https://x.test/api/send', { method: 'POST', headers, body: JSON.stringify(body) }),
      env,
    });
  }

  function lastBody() {
    const { init } = calls[calls.length - 1];
    return init.body instanceof FormData
      ? Object.fromEntries([...init.body].map(([k, v]) => [k, v]))
      : JSON.parse(init.body);
  }

  it('sends a short note as a regular HTML message, with the IP as a spoiler', async function () {
    const res = await post({ type: 'text', content: 'hello <world> & friends' }, '1.2.3.4');
    assert.strictEqual(res.status, 200);
    const body = lastBody();
    assert.match(calls[0].url, /\/sendMessage$/);
    assert.strictEqual(body.text, '📝 hello &lt;world&gt; &amp; friends\n<tg-spoiler>📍 1.2.3.4</tg-spoiler>');
    assert.strictEqual(body.parse_mode, 'HTML');
    const out = await res.json();
    assert.deepStrictEqual(out, { ok: true, messageId: 42, chatId: '-100123' });
  });

  it('sends a link with the 🔗 prefix and no spoiler without an IP', async function () {
    await post({ type: 'link', content: 'https://example.com' });
    const body = lastBody();
    assert.match(calls[0].url, /\/sendMessage$/);
    assert.strictEqual(body.text, '🔗 https://example.com');
    assert.ok(!body.text.includes('tg-spoiler'));
  });

  it('sends a 5000-character note as a rich message, not split', async function () {
    const content = 'x'.repeat(5000);
    await post({ type: 'text', content }, '1.2.3.4');
    assert.match(calls[0].url, /\/sendRichMessage$/);
    const body = lastBody();
    assert.strictEqual(body.chat_id, '-100123');
    assert.ok(body.rich_message.html.startsWith('<p>📝 ' + 'x'.repeat(5000) + '</p>'));
    assert.ok(body.rich_message.html.includes('<p><tg-spoiler>📍 1.2.3.4</tg-spoiler></p>'));
    assert.strictEqual(body.disable_notification, undefined);
  });

  it('respects silent mode on the rich message path', async function () {
    await post({ type: 'text', content: 'y'.repeat(5000), silent: true });
    assert.strictEqual(lastBody().disable_notification, true);
  });

  it('delivers an extremely long note as a note.txt document', async function () {
    const content = 'a'.repeat(40000);
    const res = await post({ type: 'text', content, silent: true });
    assert.strictEqual(res.status, 200);
    assert.match(calls[0].url, /\/sendDocument$/);
    const body = lastBody();
    assert.strictEqual(body.document.name, 'note.txt');
    assert.strictEqual(body.disable_notification, 'true');
    assert.match(body.caption, /40,000 characters, too long for a message/);
    assert.match(body.caption, /note\.txt/);
  });

  it('names the .txt after the type for links', async function () {
    await post({ type: 'link', content: 'https://example.com/' + 'z'.repeat(40000) });
    assert.strictEqual(lastBody().document.name, 'link.txt');
  });

  it('keeps a 4080-character note on the regular sendMessage path', async function () {
    // 3 (prefix) + 4080 (note) + 11 (spoiler line) = 4094 <= 4096.
    await post({ type: 'text', content: 'b'.repeat(4080) }, '1.2.3.4');
    assert.match(calls[0].url, /\/sendMessage$/);
  });

  it('rejects unauthenticated requests without touching Telegram', async function () {
    const res = await onRequestPost({
      request: new Request('https://x.test/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer nope' },
        body: JSON.stringify({ type: 'text', content: 'hi' }),
      }),
      env,
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
  });
});
