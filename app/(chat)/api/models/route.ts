import { getCapabilities, getUpstreamModels } from "@/lib/ai/models";

export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  };

  const [models, capabilities] = await Promise.all([
    getUpstreamModels(),
    getCapabilities(),
  ]);

  return Response.json({ models, capabilities }, { headers });
}
