import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "./lib/builders";
import { requireWorkspace } from "../lib/cloud/contracts";
import type { KnowledgeRecord } from "../lib/agent/knowledge";
import { knowledge, rankKnowledge } from "../lib/agent/knowledge";
import { callModel } from "../lib/agent/model";
import { configuredProvider } from "../lib/agent/providers";
import { memoryNamespace, searchSupermemory } from "../lib/agent/supermemory";

// Internal registered functions are callable only by Convex server functions.
const reserve = makeFunctionReference<"mutation", { workspaceId: string; owner: string; provider: string; model: string }, GenericId<"agentRuns">>("agentState:reserve");
const context = makeFunctionReference<"query", { workspaceId: string; owner: string }, string[]>("agentState:context");
const finish = makeFunctionReference<"mutation", { id: GenericId<"agentRuns">; success: boolean; inputTokens: number; outputTokens: number }, null>("agentState:finish");

const userKnowledge = makeFunctionReference<"query", { workspaceId: string; owner: string }, KnowledgeRecord[]>("agentKnowledge:context");

export const ask = action({
  args: { provider: v.string(), question: v.string(), consent: v.boolean(), summary: v.object({ durationMs: v.number(), clips: v.number(), assets: v.number(), tracks: v.number(), timelineVersion: v.number(), selected: v.boolean() }) },
  handler: async (ctx, { provider: providerId, question, summary, consent }) => {
    const identity = await ctx.auth.getUserIdentity();
    const workspaceId = requireWorkspace(identity);
    if (!consent) throw new Error("Confirm sending this question and context to the cloud model.");
    if (!question.trim() || question.length > 2000) throw new Error("Question must be 1–2000 characters.");
    if (Object.values(summary).some((value) => typeof value === "number" && (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000))) throw new Error("Invalid project summary.");
    const allowed = (process.env.AGENT_ALLOWED_SUBJECTS ?? "").split(",").map((value) => value.trim()).includes(identity!.subject);
    if (!allowed) throw new Error("Cloud reasoning is limited to configured development users.");
    const provider = configuredProvider(providerId, allowed);
    const scope = { workspaceId, owner: identity!.subject };
    const id = await ctx.runMutation(reserve, { ...scope, provider: provider.id, model: provider.model });
    try {
      const explicitMemory = await ctx.runQuery(context, scope);
      let recalledMemory: string[] = [];
      if (process.env.SUPERMEMORY_API_KEY) {
        try {
          recalledMemory = (await searchSupermemory(process.env.SUPERMEMORY_API_KEY, await memoryNamespace(workspaceId, identity!.subject), question.trim())).map((item) => item.text);
        } catch { /* Convex notes remain the reliable fallback. */ }
      }
      const privateRecords = await ctx.runQuery(userKnowledge, scope);
      const memory = [...new Set([...explicitMemory, ...recalledMemory])].slice(0, 12);
      const result = await callModel({ question: question.trim(), summary, records: rankKnowledge(question, [...knowledge, ...privateRecords]), memory }, provider);
      await ctx.runMutation(finish, { id, success: true, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      return { ...result.reply, runId: id };
    } catch {
      await ctx.runMutation(finish, { id, success: false, inputTokens: 0, outputTokens: 0 });
      throw new Error("Cloud reasoning could not complete (quota, timeout or invalid response). No edit was applied. Use offline knowledge.");
    }
  },
});
