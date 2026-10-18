import { groqProvider, parseBrainReply, SYSTEM_PROMPT } from "./brain";
import type { BrainReply, ProjectSummary } from "./brain";
import type { KnowledgeRecord } from "./knowledge";
import type { ProviderRuntime } from "./providers";

export interface ModelContext { question: string; summary: ProjectSummary; records: KnowledgeRecord[]; memory: string[] }
export interface ModelResult { reply: BrainReply; inputTokens: number; outputTokens: number }
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const promptData = (context: ModelContext) => JSON.stringify({ ...context, records: context.records.map(({ id, title, body }) => ({ id, title, body })) });
const boundedTokenCount = (value: unknown) => Math.max(0, Math.min(1_000_000, Number(value) || 0));

export async function callModel(context: ModelContext, provider: ProviderRuntime, fetcher: Fetcher = fetch): Promise<ModelResult> {
  let url = provider.endpoint;
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: unknown;
  if (provider.protocol === "openai-chat") {
    headers.Authorization = `Bearer ${provider.apiKey}`;
    body = { model: provider.model, temperature: 0.2, max_completion_tokens: 1500, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: promptData(context) }] };
  } else if (provider.protocol === "anthropic-messages") {
    headers["x-api-key"] = provider.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: provider.model, max_tokens: 1500, temperature: 0.2, system: SYSTEM_PROMPT, messages: [{ role: "user", content: promptData(context) }] };
  } else {
    url = `${provider.endpoint}/${encodeURIComponent(provider.model)}:generateContent`;
    headers["x-goog-api-key"] = provider.apiKey;
    body = { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: "user", parts: [{ text: promptData(context) }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: "application/json" } };
  }
  const response = await fetcher(url, { method: "POST", signal: AbortSignal.timeout(25_000), headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(response.status === 429 ? "Free model quota reached. Use offline knowledge or retry later." : "Model service unavailable. Use offline knowledge.");
  // Never return/log raw provider errors, requests, authorization headers or hidden reasoning.
  const text = await response.text();
  if (text.length > 100_000) throw new Error("Model response too large.");
  const data = JSON.parse(text);
  const content = provider.protocol === "anthropic-messages"
    ? data.content?.find((item: { type?: unknown }) => item?.type === "text")?.text
    : provider.protocol === "gemini-generate-content"
      ? data.candidates?.[0]?.content?.parts?.find((item: { text?: unknown }) => typeof item?.text === "string")?.text
      : data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model returned no answer.");
  const inputTokens = provider.protocol === "anthropic-messages" ? data.usage?.input_tokens : provider.protocol === "gemini-generate-content" ? data.usageMetadata?.promptTokenCount : data.usage?.prompt_tokens;
  const outputTokens = provider.protocol === "anthropic-messages" ? data.usage?.output_tokens : provider.protocol === "gemini-generate-content" ? data.usageMetadata?.candidatesTokenCount : data.usage?.completion_tokens;
  return { reply: parseBrainReply(content, context.records.map((record) => record.id)), inputTokens: boundedTokenCount(inputTokens), outputTokens: boundedTokenCount(outputTokens) };
}

export async function callGroq(context: ModelContext, apiKey: string, fetcher: Fetcher = fetch): Promise<ModelResult> {
  if (!groqProvider.capabilities.includes("text-reasoning")) throw new Error("Provider capability unavailable.");
  return await callModel(context, { id: "groq", label: "Groq", protocol: "openai-chat", endpoint: "https://api.groq.com/openai/v1/chat/completions", apiKey, model: groqProvider.model, freeFirst: true }, fetcher);
}
