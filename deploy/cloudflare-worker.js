// Cloudflare Worker: route POST /api/chat to VPS, pass everything else through to Vercel
//
// Deploy steps:
//   1. Cloudflare Dashboard → Workers & Pages → Create Worker
//   2. Paste this code
//   3. Settings → Triggers → Add route: chat.tok.md/*

const VPS_HOST = "chat-api.tok.md";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only POST /api/chat goes to VPS
    if (request.method === "POST" && url.pathname === "/api/chat") {
      const target = new URL(request.url);
      target.hostname = VPS_HOST;
      return fetch(new Request(target.toString(), request));
    }

    // Everything else: pass through unchanged — preserves Host/Origin headers
    // so Next.js Server Action CSRF check passes
    return fetch(request);
  },
};
