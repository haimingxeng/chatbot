export const DEFAULT_CHAT_MODEL = "gpt-5.4";

export const titleModel = {
  id: "gpt-5.4-mini",
  name: "GPT-5.4 Mini",
  provider: "openai",
  description: "Fast model for title generation",
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

// Fallback list used when the upstream /v1/models call fails
export const chatModels: ChatModel[] = [
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    description: "Latest flagship model",
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "openai",
    description: "Fast and cost-efficient model",
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    provider: "openai",
    description: "Advanced coding model",
  },
  {
    id: "gpt-5.3-codex-spark",
    name: "GPT-5.3 Codex Spark",
    provider: "openai",
    description: "Fast coding model",
  },
];

type UpstreamModel = {
  id: string;
  object?: string;
};

export async function getUpstreamModels(): Promise<ChatModel[]> {
  try {
    const res = await fetch(
      `${process.env.OPENAI_BASE_URL ?? "https://tok.md/v1"}/models`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return chatModels;

    const json = await res.json();
    const models: ChatModel[] = (json.data ?? []).map((m: UpstreamModel) => ({
      id: m.id,
      name: m.id,
      provider: "openai",
      description: "",
    }));
    return models.length > 0 ? models : chatModels;
  } catch {
    return chatModels;
  }
}

export async function getCapabilities(): Promise<Record<string, ModelCapabilities>> {
  const models = await getUpstreamModels();
  return Object.fromEntries(
    models.map((m) => [
      m.id,
      {
        tools: true,
        vision: m.id.includes("gpt-4") || m.id.includes("4o"),
        reasoning: m.id.startsWith("o"),
      },
    ])
  );
}

export const isDemo = false;

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export async function isModelAllowed(modelId: string): Promise<boolean> {
  if (allowedModelIds.has(modelId)) return true;
  const upstream = await getUpstreamModels();
  return upstream.some((m) => m.id === modelId);
}

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
