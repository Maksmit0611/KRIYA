import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "./lib/builders";
import { requireWorkspace } from "../lib/cloud/contracts";
import { addSupermemory, deleteSupermemory, memoryNamespace } from "../lib/agent/supermemory";

const insertMemory = makeFunctionReference<"mutation", { workspaceId: string; owner: string; text: string; externalId?: string }, GenericId<"agentMemory">>("agentState:insertMemory");
const getMemory = makeFunctionReference<"query", { id: GenericId<"agentMemory"> }, { workspaceId: string; owner: string; text: string; externalId?: string } | null>("agentState:getMemory");
const deleteMemory = makeFunctionReference<"mutation", { id: GenericId<"agentMemory"> }, null>("agentState:deleteMemory");

function allowed(subject: string): boolean {
  return (process.env.AGENT_ALLOWED_SUBJECTS ?? "").split(",").map((value) => value.trim()).includes(subject);
}

export const remember = action({ args: { text: v.string() }, handler: async (ctx, { text }) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  const clean = text.trim();
  if (!clean || clean.length > 500) throw new Error("Memory must be 1–500 characters.");
  const apiKey = allowed(identity!.subject) ? process.env.SUPERMEMORY_API_KEY : undefined;
  const externalId = apiKey ? `kriya-note-${crypto.randomUUID()}` : undefined;
  if (apiKey && externalId) await addSupermemory(apiKey, await memoryNamespace(workspaceId, identity!.subject), externalId, clean);
  return await ctx.runMutation(insertMemory, { workspaceId, owner: identity!.subject, text: clean, externalId });
} });

export const forget = action({ args: { id: v.id("agentMemory") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  const row = await ctx.runQuery(getMemory, { id });
  if (!row || row.workspaceId !== workspaceId || row.owner !== identity!.subject) throw new Error("Memory unavailable.");
  const apiKey = allowed(identity!.subject) ? process.env.SUPERMEMORY_API_KEY : undefined;
  if (apiKey && row.externalId) await deleteSupermemory(apiKey, await memoryNamespace(workspaceId, identity!.subject), row.externalId);
  await ctx.runMutation(deleteMemory, { id });
  return null;
} });
