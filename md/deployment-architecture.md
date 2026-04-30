# Deployment Architecture

## Problem

Vercel Hobby plan has a **60-second hard timeout** on Serverless Functions. Long AI responses get cut off mid-stream with no configuration workaround.

## Solution

Cloudflare Worker routes only `POST /api/chat` to a self-hosted VPS (no timeout). Everything else passes through to Vercel unchanged. **Zero application code changes.**

## Architecture

```
Browser
  │
  ▼
Cloudflare Worker  chat.tok.md
  │
  ├── POST /api/chat ──→  VPS  chat-api.tok.md:443
  │                       Nginx proxy_read_timeout 600s
  │                       Docker Next.js standalone :3001
  │
  └── * (pass-through) ─→  Vercel  chatbot-haimingxeng.vercel.app
                            Pages · Auth · Server Actions · APIs
```

### Why pass-through matters

The Worker must call `fetch(request)` for non-VPS traffic — not `fetch(new Request(...))`. Constructing a new request changes the `Host` header from `chat.tok.md` to `chatbot-haimingxeng.vercel.app`, which breaks Next.js Server Action CSRF validation.

### Why sessions work across both deployments

NextAuth v5 signs session cookies with `AUTH_SECRET`. Both deployments share the same secret, so a session issued by Vercel is valid on VPS. `NEXTAUTH_URL` must **not** be set — NextAuth v5 infers the base URL from the request host via `trustHost: true`.

## Infrastructure

| Component | Detail |
|-----------|--------|
| **Vercel** | Primary host — pages, auth, all APIs except `/api/chat` |
| **VPS** | RackNerd Illinois · 172.245.72.38 · Docker + Nginx |
| **Cloudflare Worker** | Edge router · `chat.tok.md/*` · fail open |
| **Neon PostgreSQL** | Shared DB — chat history, messages, users |
| **Upstash Redis** | Shared — IP rate limiting, resumable streams |
| **Vercel Blob** | File uploads |

## Environment Variables

Identical on both Vercel and VPS. See [`.env.production.example`](../.env.production.example).

| Variable | Notes |
|----------|-------|
| `AUTH_SECRET` | Must match exactly on both sides |
| `POSTGRES_URL` | Neon connection string |
| `REDIS_URL` | Upstash connection string |
| `OPENAI_API_KEY` | tok.md API key |
| `OPENAI_BASE_URL` | `https://tok.md/v1` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob |
| `REGULAR_USER_MAX_MESSAGES_PER_HOUR` | Default: `100` |

> Do **not** set `NEXTAUTH_URL` on either side.

## Deployment

### VPS — first time

```bash
# Dependencies
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sh && systemctl enable --now docker

# App
git clone https://github.com/haimingxeng/chatbot /srv/chatbot
cd /srv/chatbot
cp .env.production.example .env.production && vi .env.production

# Nginx + SSL
cp deploy/nginx-chat-api.conf /etc/nginx/sites-available/chat-api.tok.md
ln -s /etc/nginx/sites-available/chat-api.tok.md /etc/nginx/sites-enabled/
certbot --nginx -d chat-api.tok.md

# Start
docker compose build && docker compose up -d
```

### VPS — update

```bash
cd /srv/chatbot && git pull origin main
docker compose build && docker compose up -d
```

### Cloudflare Worker

1. Workers & Pages → Create Worker → paste [`deploy/cloudflare-worker.js`](../deploy/cloudflare-worker.js) → Deploy
2. Settings → Triggers → Routes: `chat.tok.md/*` · Zone: `tok.md` · **Fail open**

### Vercel

Standard git-push. No extra config beyond environment variables.

## Failure Modes

| Scenario | Impact |
|----------|--------|
| VPS down | `/api/chat` unavailable; all other features unaffected |
| Worker quota exceeded | Fail open → Vercel handles all traffic (60s limit applies) |
| Vercel down | `/api/chat` works; pages and auth unavailable |
