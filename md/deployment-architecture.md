# Deployment Architecture

## Problem

Vercel Hobby plan enforces a **60-second hard timeout** on Serverless Functions. Long AI responses (complex reasoning, long documents, code generation) exceed this limit and get cut off mid-stream.

## Solution

Route the only long-running request (`POST /api/chat`) to a self-hosted VPS via Cloudflare Worker, while keeping everything else on Vercel. Zero code changes required.

## Architecture

```
Browser
  │
  ▼
Cloudflare Worker  (chat.tok.md)
  │
  ├── POST /api/chat  ──────────────────→  VPS  chat-api.tok.md
  │                                        Nginx: proxy_read_timeout 600s
  │                                        Docker: Next.js standalone :3001
  │
  └── All other requests  ──────────────→  Vercel  chatbot-haimingxeng.vercel.app
                                           Pages, auth, all other APIs
```

## Components

### Cloudflare Worker

File: [`deploy/cloudflare-worker.js`](../deploy/cloudflare-worker.js)

Routes `POST /api/chat` to VPS, proxies everything else to Vercel. Runs at the edge with no timeout constraints. Configured with **fail open** so requests fall back to Vercel if the Worker is unavailable.

### VPS (172.245.72.38 — RackNerd Illinois)

Runs the same Next.js codebase as Vercel via Docker.

| Service | Config |
|---------|--------|
| Next.js standalone | Docker, port 3001 (localhost only) |
| Nginx | SSL termination, `proxy_read_timeout 600s` |
| SSL | Let's Encrypt, auto-renews |

Key files:
- [`Dockerfile`](../Dockerfile)
- [`docker-compose.yml`](../docker-compose.yml)
- [`deploy/nginx-chat-api.conf`](../deploy/nginx-chat-api.conf)

### Shared Infrastructure

Both Vercel and VPS connect to the same backend services:

| Service | Used for |
|---------|----------|
| Neon PostgreSQL | Chat history, messages, users |
| Upstash Redis | IP rate limiting, resumable streams |
| Vercel Blob | File uploads |

Session cookies are JWT-encrypted with `AUTH_SECRET`. Since both deployments share the same secret, sessions issued by Vercel are valid on VPS — users see no difference.

## Deployment

### VPS — initial setup

```bash
# Clone and configure
git clone https://github.com/haimingxeng/chatbot /srv/chatbot
cd /srv/chatbot
cp .env.production.example .env.production
vi .env.production  # fill in env vars

# Nginx + SSL
cp deploy/nginx-chat-api.conf /etc/nginx/sites-available/chat-api.tok.md
ln -s /etc/nginx/sites-available/chat-api.tok.md /etc/nginx/sites-enabled/
certbot --nginx -d chat-api.tok.md

# Build and start
docker compose build && docker compose up -d
```

### VPS — update

```bash
cd /srv/chatbot
git pull origin main
docker compose build && docker compose up -d
```

### Cloudflare Worker

1. Workers & Pages → Create Worker → paste `deploy/cloudflare-worker.js`
2. Settings → Triggers → Routes → `chat.tok.md/*` (fail open)

## Environment Variables

Both Vercel and VPS must share identical values for:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | JWT session signing — **must match** |
| `POSTGRES_URL` | Neon database |
| `REDIS_URL` | Upstash Redis |
| `OPENAI_API_KEY` | tok.md API key |
| `OPENAI_BASE_URL` | `https://tok.md/v1` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |

See [`.env.production.example`](../.env.production.example) for the full template.

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| VPS down | Worker fail open → requests go to Vercel (60s limit applies again) |
| Worker unavailable | Cloudflare routes directly to Vercel |
| Vercel down | `/api/chat` still works via VPS; pages unavailable |
