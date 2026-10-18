import { afterEach, describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import recordSchema from "../../../schemas/knowledge-record.schema.json";
import { knowledge, searchKnowledge } from "./knowledge";
import { groqProvider, offlineAdvice, parseBrainReply, suggestedRequest, summarizeProject } from "./brain";
import { callGroq } from "./model";
import { callModel } from "./model";
import { assertProviderRegistry, configuredProvider, providerStatuses } from "./providers";
import { createInitialState } from "../project/initial";

const good = { answer: "Review the clip first.", citations: ["kriya-split"], edit: "split", speed: null };
afterEach(() => { for (const key of ["AGENT_ALLOWED_SUBJECTS", "OPENAI_API_KEY", "OPENAI_MODEL", "KRIYA_ENABLE_PAID_PROVIDERS"]) delete process.env[key]; });
describe("grounded agent brain", () => {
  test("all bundled records validate and include provenance", () => {
    const validate = new Ajv2020({ strict: false }).compile(recordSchema);
    expect(knowledge.length).toBe(45);
    expect(new Set(knowledge.map((record) => record.id)).size).toBe(knowledge.length);
    for (const record of knowledge) expect(validate(record)).toBe(true);
    expect(groqProvider.capabilities).toContain("text-reasoning");
    expect(() => assertProviderRegistry()).not.toThrow();
  });
  test("retrieves useful knowledge and handles unknown questions without inventing", () => {
    expect(searchKnowledge("webm codec container").some((record) => record.id === "kriya-containers")).toBe(true);
    expect(searchKnowledge("pacing")[0].id).toBe("kriya-pacing");
    expect(searchKnowledge("the and my")).toEqual([]);
    expect(offlineAdvice("zyxwunknown").citations).toEqual([]);
  });
  test("only supported structured proposals and known citations pass", () => {
    expect(suggestedRequest(parseBrainReply(JSON.stringify(good), ["kriya-split"]))).toBe("split clip at playhead");
    for (const bad of [{ ...good, edit: "shell" }, { ...good, command: "rm" }, { ...good, citations: ["invented"] }, { ...good, speed: 2 }, { ...good, edit: "speed", speed: 0 }, { ...good, edit: "speed", speed: null }]) expect(() => parseBrainReply(JSON.stringify(bad), ["kriya-split"])).toThrow();
  });
  test("provider request is bounded, text-only and includes explicit context", async () => {
    const state = createInitialState();
    state.project.name = "PRIVATE FILENAME DO NOT SEND";
    const summary = summarizeProject(state);
    const result = await callGroq({ question: "Split selected clip", summary, records: searchKnowledge("split"), memory: ["Prefer concise answers"] }, "test-key", async (url, init) => {
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      const body = JSON.parse(init!.body as string);
      expect(body.max_completion_tokens).toBe(1500);
      expect(body.messages[1].content).not.toContain(state.project.name);
      expect(body.messages[1].content).toContain("Prefer concise answers");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(good) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } }));
    });
    expect(result.reply.edit).toBe("split");
    expect(result.inputTokens).toBe(100);
    await expect(callGroq({ question: "test", summary, records: [], memory: [] }, "test-key", async () => new Response("sensitive raw error", { status: 429 }))).rejects.toThrow("quota");
  });
  test("paid providers require an explicit kill switch, key and model", () => {
    process.env.AGENT_ALLOWED_SUBJECTS = "user_a";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
    expect(providerStatuses(true).find((provider) => provider.id === "openai")?.configured).toBe(false);
    process.env.KRIYA_ENABLE_PAID_PROVIDERS = "true";
    expect(configuredProvider("openai", true).model).toBe("test-model");
  });
  test("normalizes Anthropic and Gemini structured responses", async () => {
    const context = { question: "Improve pacing", summary: summarizeProject(createInitialState()), records: searchKnowledge("pacing"), memory: [] };
    const answer = JSON.stringify({ answer: "Review shot length.", citations: ["kriya-pacing"], edit: "none", speed: null });
    const anthropic = await callModel(context, { id: "anthropic", label: "Anthropic", protocol: "anthropic-messages", endpoint: "https://api.anthropic.com/v1/messages", apiKey: "test", model: "test", freeFirst: false }, async (_url, init) => {
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test");
      return new Response(JSON.stringify({ content: [{ type: "text", text: answer }], usage: { input_tokens: 9, output_tokens: 5 } }));
    });
    const gemini = await callModel(context, { id: "gemini", label: "Gemini", protocol: "gemini-generate-content", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", apiKey: "test", model: "test/model", freeFirst: false }, async (url, init) => {
      expect(String(url)).toContain("test%2Fmodel:generateContent");
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("test");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 4 } }));
    });
    expect(anthropic.inputTokens).toBe(9);
    expect(gemini.outputTokens).toBe(4);
  });
});
