# Deployment Architecture

## Problem

Vercel Hobby plan enforces a **60-second hard timeout** on Serverless Functions. Long AI responses (complex reasoning, documents, code generation) exceed this limit and get cut off mid-stream.

## Solution

Use a Cloudflare Worker to route only `POST /api/chat` to a self-hosted VPS with no timeout limit. All other requests pass through unchanged to Vercel. Zero changes to application code.

**Key design principle**: the Worker must be fully transparent for non-VPS requests — any header modification breaks Next.js Server Action CSRF validation.

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
  └── All other requests  ──────────────→  Vercel  (pass-through, headers unchanged)
                                           Pages, auth, Server Actions, all APIs
```

## Components

### Cloudflare Worker

File: [`deploy/cloudflare-worker.js`](../deploy/cloudflare-worker.js)

```js
const VPS_HOST = "chat-api.tok.md";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const target = new URL(request.url);
      target.hostname = VPS_HOST;
      return fetch(new Request(target.toString(), request));
    }

    // Pass through unchanged — do NOT modify headers
    // Modifying Host/Origin breaks Next.js Server Action CSRF validation
    return fetch(request);
  },
};
```

Configured with **fail open** so requests fall back to Vercel if the Worker quota is exceeded.

### VPS (172.245.72.38 — RackNerd Illinois)

Same Next.js codebase as Vercel, running in Docker.

| Service | Detail |
|---------|--------|
| Next.js standalone | Docker container, port 3001 (localhost only) |
| Nginx | SSL termination, `proxy_read_timeout 600s`, `proxy_buffering off` |
| SSL | Let's Encrypt, auto-renews |

Key files:
- [`Dockerfile`](../Dockerfile)
- [`docker-compose.yml`](../docker-compose.yml)
- [`deploy/nginx-chat-api.conf`](../deploy/nginx-chat-api.conf)

### Shared Infrastructure

Both Vercel and VPS connect to the same backend services:

| Service | Purpose |
|---------|---------|
| Neon PostgreSQL | Chat history, messages, users |
| Upstash Redis | IP rate limiting, resumable streams |
| Vercel Blob | File uploads |

Session cookies are JWT-encrypted with `AUTH_SECRET`. Both deployments share the same secret so sessions issued by Vercel are valid on VPS — users see no difference.

## Environment Variables

Both Vercel and VPS must share identical values. Do **not** set `NEXTAUTH_URL` — NextAuth v5 infers the URL from the request host via `trustHost: true`.

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | JWT session signing — **must match on both sides** |
| `POSTGRES_URL` | Neon database connection string |
| `REDIS_URL` | Upstash Redis connection string |
| `OPENAI_API_KEY` | tok.md API key |
| `OPENAI_BASE_URL` | `https://tok.md/v1` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `REGULAR_USER_MAX_MESSAGES_PER_HOUR` | Rate limit (default: 100) |

See [`.env.production.example`](../.env.production.example) for the full template.

## Deployment

### VPS — initial setup

```bash
# Install dependencies
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sh && systemctl enable --now docker

# Clone and configure
git clone https://github.com/haimingxeng/chatbot /srv/chatbot
cd /srv/chatbot
cp .env.production.example .env.production
vi .env.production  # fill in all env vars

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

1. Workers & Pages → Create Worker → paste `deploy/cloudflare-worker.js` → Deploy
2. Settings → Triggers → Routes → `chat.tok.md/*`, Zone: `tok.md`, **Fail open**

### Vercel

Standard git-push deploy. No special configuration needed beyond environment variables.

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| VPS down | `POST /api/chat` fails (no fallback — 60s limit would apply on Vercel) |
| Worker quota exceeded | Fail open → all traffic goes to Vercel (60s limit applies) |
| Vercel down | `/api/chat` still works via VPS; pages and auth unavailable |

## Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Login 500 on `chat.tok.md` | Worker modified `Host`/`Origin` headers breaking CSRF | Pass non-VPS requests through with `fetch(request)` unchanged |
| `callback-url` set to wrong domain | `NEXTAUTH_URL` set explicitly | Remove `NEXTAUTH_URL`; let NextAuth v5 infer from request host |
| Session invalid on VPS | `AUTH_SECRET` mismatch between Vercel and VPS | Ensure identical `AUTH_SECRET` on both sides |
