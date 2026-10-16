import { groqProvider, parseBrainReply, SYSTEM_PROMPT } from "./brain";
import type { BrainReply, ProjectSummary } from "./brain";
import type { KnowledgeRecord } from "./knowledge";

interface ModelContext { question: string; summary: ProjectSummary; records: KnowledgeRecord[]; memory: string[] }
export async function callGroq(context: ModelContext, apiKey: string, fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch): Promise<{ reply: BrainReply; inputTokens: number; outputTokens: number }> {
  if (!groqProvider.capabilities.includes("text-reasoning")) throw new Error("Provider capability unavailable.");
  const response = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(25_000),
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: groqProvider.model, temperature: 0.2, max_completion_tokens: 1500, reasoning_effort: "low", response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify({ ...context, records: context.records.map(({ id, title, body }) => ({ id, title, body })) }) }] }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "Free model quota reached. Use offline knowledge or retry later." : "Model service unavailable. Use offline knowledge.");
  // Never return/log raw provider errors, requests, authorization headers or hidden reasoning.
  const text = await response.text();
  if (text.length > 100_000) throw new Error("Model response too large.");
  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model returned no answer.");
  return { reply: parseBrainReply(content, context.records.map((record) => record.id)), inputTokens: Math.max(0, Number(data.usage?.prompt_tokens) || 0), outputTokens: Math.max(0, Number(data.usage?.completion_tokens) || 0) };
}
