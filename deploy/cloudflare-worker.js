// Cloudflare Worker: route POST /api/chat to VPS, everything else to Vercel
//
// Deploy steps:
//   1. Cloudflare Dashboard → Workers & Pages → Create Worker
//   2. Paste this code
//   3. Settings → Triggers → Add route: chat.tok.md/*

const VPS_HOST = "chat-api.tok.md";
const VERCEL_HOST = "chatbot-haimingxeng.vercel.app";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Route POST /api/chat to VPS (no timeout constraints)
    if (request.method === "POST" && url.pathname === "/api/chat") {
      const vpsUrl = new URL(request.url);
      vpsUrl.hostname = VPS_HOST;
      return fetch(new Request(vpsUrl.toString(), request));
    }

    // Everything else → Vercel
    // Strip x-forwarded-for to avoid NextAuth v5 header parsing bug
    const vercelUrl = new URL(request.url);
    vercelUrl.hostname = VERCEL_HOST;
    const headers = new Headers(request.headers);
    headers.delete("x-forwarded-for");
    headers.set("x-forwarded-host", url.hostname);
    return fetch(new Request(vercelUrl.toString(), { ...request, headers }));
  },
};
