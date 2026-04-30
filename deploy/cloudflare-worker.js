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

    // Only POST /api/chat goes to VPS — auth and everything else stays on Vercel
    if (request.method === "POST" && url.pathname === "/api/chat") {
      const target = new URL(request.url);
      target.hostname = VPS_HOST;
      return fetch(new Request(target.toString(), request));
    }

    // Everything else → Vercel
    const target = new URL(request.url);
    target.hostname = VERCEL_HOST;
    const headers = new Headers(request.headers);
    headers.delete("x-forwarded-for");
    return fetch(new Request(target.toString(), { ...request, headers }));
  },
};
