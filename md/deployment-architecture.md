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

## How Routing Works

### DNS layer

`chat.tok.md` is a Cloudflare Proxied record. Users resolve to Cloudflare edge IPs — Vercel's real IP is never exposed. All traffic enters Cloudflare first.

### Worker layer

The Worker intercepts every request matching `chat.tok.md/*` before it reaches any origin:

```
Request arrives at Cloudflare edge
  │
  ├── POST /api/chat?
  │     YES → rewrite hostname to chat-api.tok.md → forward to VPS
  │     NO  → fetch(request) unchanged → Cloudflare forwards to Vercel
```

The Worker runs on V8 at the edge, adding ~1ms overhead.

### Why `fetch(request)` not `fetch(new Request(...))`

Constructing a new request object changes `Host: chat.tok.md` → `Host: chatbot-haimingxeng.vercel.app`. Next.js Server Actions validate that `Origin` matches `Host` as a CSRF check — a mismatch returns 500. Passing the original request object preserves all headers unchanged.

## How Sessions Work Across Two Deployments

NextAuth v5 stores sessions as **stateless JWTs**, not server-side sessions:

```
Login (Vercel):
  NextAuth signs JWT with AUTH_SECRET
  Sets Cookie: __Secure-authjs.session-token=<JWT>  Domain: chat.tok.md

Send message (Worker → VPS):
  Browser sends Cookie for chat.tok.md automatically
  VPS decrypts JWT with the same AUTH_SECRET → identity verified ✅
```

Both deployments share the same `AUTH_SECRET`, so either side can verify tokens issued by the other. No shared session store needed.

> `NEXTAUTH_URL` must **not** be set on either side. NextAuth v5 infers the base URL from the incoming request host via `trustHost: true`. Setting it explicitly causes `signIn()` to make internal requests to that URL, which routes back through Cloudflare and breaks the auth flow.

## Cookie Isolation Between Domains

`chat.tok.md` and `chat-api.tok.md` are separate origins. Cookies are domain-scoped:

| Action | Cookie domain | Accessible from |
|--------|--------------|-----------------|
| Login at `chat.tok.md` | `chat.tok.md` | `chat.tok.md` only |
| Login at `chat-api.tok.md` | `chat-api.tok.md` | `chat-api.tok.md` only |

Sessions are **not shared** between the two domains. This is by design — `chat-api.tok.md` is a backend target for the Worker, not a user-facing URL. Users always access `chat.tok.md`; their cookies are always `chat.tok.md`-scoped and forwarded transparently by the Worker to VPS.

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
| Vercel down | `/api/chat` works via VPS; pages and auth unavailable |
