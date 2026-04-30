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

    const targetHost =
      request.method === "POST" && url.pathname === "/api/chat"
        ? VPS_HOST
        : VERCEL_HOST;

    const target = new URL(request.url);
    target.hostname = targetHost;

    // Fully transparent proxy — do not modify any headers
    return fetch(new Request(target.toString(), request));
  },
};
