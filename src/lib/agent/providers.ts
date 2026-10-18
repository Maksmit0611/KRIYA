import registry from "../../../data/agent/providers.json";

export type CloudProviderId = "groq" | "openai" | "anthropic" | "gemini" | "grok";
export type ProviderProtocol = "openai-chat" | "anthropic-messages" | "gemini-generate-content";

export interface ProviderRuntime {
  id: CloudProviderId;
  label: string;
  protocol: ProviderProtocol;
  endpoint: string;
  apiKey: string;
  model: string;
  freeFirst: boolean;
}

const cloudDefinitions: Record<CloudProviderId, Omit<ProviderRuntime, "apiKey" | "model"> & { keyEnv: string; modelEnv?: string; defaultModel?: string }> = {
  groq: { id: "groq", label: "Groq", protocol: "openai-chat", endpoint: "https://api.groq.com/openai/v1/chat/completions", keyEnv: "GROQ_API_KEY", defaultModel: "openai/gpt-oss-20b", freeFirst: true },
  openai: { id: "openai", label: "OpenAI", protocol: "openai-chat", endpoint: "https://api.openai.com/v1/chat/completions", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", freeFirst: false },
  anthropic: { id: "anthropic", label: "Anthropic", protocol: "anthropic-messages", endpoint: "https://api.anthropic.com/v1/messages", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", freeFirst: false },
  gemini: { id: "gemini", label: "Gemini", protocol: "gemini-generate-content", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", freeFirst: false },
  grok: { id: "grok", label: "Grok", protocol: "openai-chat", endpoint: "https://api.x.ai/v1/chat/completions", keyEnv: "XAI_API_KEY", modelEnv: "XAI_MODEL", freeFirst: false },
};

export const cloudProviderIds = Object.keys(cloudDefinitions) as CloudProviderId[];

export function isCloudProviderId(value: string): value is CloudProviderId {
  return cloudProviderIds.includes(value as CloudProviderId);
}

export function providerStatuses(allowed: boolean) {
  return cloudProviderIds.map((id) => {
    const definition = cloudDefinitions[id];
    const model = (definition.modelEnv ? process.env[definition.modelEnv] : definition.defaultModel) ?? "";
    const paidEnabled = definition.freeFirst || process.env.KRIYA_ENABLE_PAID_PROVIDERS === "true";
    const freeConfirmed = !definition.freeFirst || process.env.GROQ_FREE_PLAN_CONFIRMED === "true";
    return { id, label: definition.label, model, freeFirst: definition.freeFirst, configured: Boolean(allowed && paidEnabled && freeConfirmed && process.env[definition.keyEnv] && model) };
  });
}

export function configuredProvider(id: string, allowed: boolean): ProviderRuntime {
  if (!isCloudProviderId(id)) throw new Error("Unknown model provider.");
  const status = providerStatuses(allowed).find((item) => item.id === id)!;
  const definition = cloudDefinitions[id];
  if (!status.configured) throw new Error(`${definition.label} is not enabled for this user.`);
  return { id, label: definition.label, protocol: definition.protocol, endpoint: definition.endpoint, apiKey: process.env[definition.keyEnv]!, model: status.model, freeFirst: definition.freeFirst };
}

export function assertProviderRegistry(): void {
  const ids = new Set(registry.providers.map((provider) => provider.id));
  for (const id of ["offline", ...cloudProviderIds]) if (!ids.has(id)) throw new Error(`Provider ${id} missing from registry.`);
}
