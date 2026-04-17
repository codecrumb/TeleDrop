# 🪂 TeleDrop

A minimal, self-hosted "send to myself" web app. Drop files, images, links, and notes into a private Telegram channel from any browser — no login required beyond a PIN.

Built on Cloudflare Pages + Functions. No database, no storage — everything goes straight to Telegram.

## Features

- **Drag & drop** files (or click to browse) — supports multiple files at once
- **Image albums** — groups up to 10 images into a single Telegram album
- **Captions** — optional captions for files and links
- **Silent send** — right-click the send button to toggle silent notifications
- **Links** and **text notes** auto-detected, or manually override with tabs
- **PIN auth** with optional 30-day "remember me" cookie
- **Turnstile CAPTCHA** after 3 failed PIN attempts (optional)
- **Deep links** after every send — jump straight to the message in Telegram
- IP address logged as a hidden spoiler on every message (tap to reveal in Telegram)

**Keyboard shortcuts:**
- `Cmd/Ctrl+Enter` — send from textarea
- `Cmd/Ctrl+O` — open file picker
- `←/→` — navigate mode tabs

## Stack

- Frontend: single-file HTML/CSS/JS — no build step
- Backend: Cloudflare Pages Functions
- Delivery: Telegram Bot API (`sendPhoto`, `sendDocument`, `sendMessage`, `sendMediaGroup`)

## Setup

### 1. Create a Telegram bot and channel

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **bot token**
2. Create a private Telegram channel
3. Add your bot as an **admin** of the channel
4. Get the channel's **chat ID** (e.g. using [@UserInfeBot](https://t.me/UserInfeBot) or by forwarding a message to the bot)
   - Channel IDs look like `-1001234567890`

### 2. Deploy to Cloudflare Pages

1. Fork or clone this repo
2. Connect it to [Cloudflare Pages](https://pages.cloudflare.com/)
3. Set these environment variables in the CF Pages dashboard:

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | Yes | Your Telegram bot token |
| `CHAT_ID` | Yes | Your private channel's chat ID (e.g. `-1001234567890`) |
| `PIN` | Yes | Any PIN or passphrase you want |
| `TURNSTILE_SITE_KEY` | No | Cloudflare Turnstile public key — enables CAPTCHA after 3 failed PIN attempts |
| `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile secret key |

No KV namespace or other bindings needed.

### 3. Open the app

Visit your Pages URL, enter the PIN, and start dropping.

## Local development

```bash
npm install
# Edit the start script in package.json with your real values, then:
npm start
```

The dev script uses `--binding` flags for local env vars — replace the placeholder `xxx` values before running.

## Limits

| | |
|---|---|
| Max file size | 100 MB (Cloudflare Pages Functions request body limit) |
| Max album size | 10 images (Telegram API limit) |
| Max text length | 4096 characters (Telegram API limit) |

## Auth notes

- The auth token is `HMAC-SHA256(key=PIN, message=BOT_TOKEN)` — deterministic, no storage needed
- Changing `PIN` or `BOT_TOKEN` in the CF Pages dashboard instantly invalidates all existing sessions
- The PIN never leaves the server; the frontend only ever sees the derived token
