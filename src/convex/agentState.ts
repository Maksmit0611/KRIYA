import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./lib/builders";
import { requireWorkspace } from "../lib/cloud/contracts";
import { groqProvider } from "../lib/agent/brain";

export const notes = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  return await ctx.db.query("agentMemory").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", identity!.subject)).take(12);
} });
export const remember = mutation({ args: { text: v.string() }, handler: async (ctx, { text }) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  const clean = text.trim();
  if (!clean || clean.length > 500) throw new Error("Memory must be 1–500 characters.");
  const existing = await ctx.db.query("agentMemory").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", identity!.subject)).take(12);
  if (existing.length >= 12) throw new Error("Forget a note before adding more (12 maximum).");
  return await ctx.db.insert("agentMemory", { workspaceId, owner: identity!.subject, text: clean, createdAt: Date.now() });
} });
export const forget = mutation({ args: { id: v.id("agentMemory") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  const row = await ctx.db.get(id);
  if (!row || row.workspaceId !== workspaceId || row.owner !== identity!.subject) throw new Error("Memory unavailable.");
  await ctx.db.delete(id);
} });
export const status = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  const allowed = (process.env.AGENT_ALLOWED_SUBJECTS ?? "").split(",").map((value) => value.trim()).includes(identity!.subject);
  return { configured: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_FREE_PLAN_CONFIRMED === "true" && allowed), model: groqProvider.model, runs: await ctx.db.query("agentRuns").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", identity!.subject)).order("desc").take(20) };
} });

export const context = internalQuery({ args: { workspaceId: v.string(), owner: v.string() }, handler: async (ctx, { workspaceId, owner }) => {
  const notes = await ctx.db.query("agentMemory").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", owner)).take(12);
  return notes.map((note) => note.text);
} });
export const reserve = internalMutation({ args: { workspaceId: v.string(), owner: v.string() }, handler: async (ctx, { workspaceId, owner }) => {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const minute = Math.floor(now / 60_000);
  for (const [scope, dailyLimit, minuteLimit] of [["global", 50, 6], [`user:${owner}`, 20, 3]] as const) {
    const row = await ctx.db.query("agentBudget").withIndex("by_scope", (q) => q.eq("scope", scope)).unique();
    const count = row?.day === day ? row.count : 0;
    const minuteCount = row?.minute === minute ? row.minuteCount : 0;
    if (count >= dailyLimit || minuteCount >= minuteLimit) throw new Error("KRIYA model budget reached. Use offline knowledge or retry later.");
    const value = { scope, day, count: count + 1, minute, minuteCount: minuteCount + 1 };
    if (row) await ctx.db.replace(row._id, value);
    else await ctx.db.insert("agentBudget", value);
  }
  const rows = await ctx.db.query("agentRuns").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", owner)).order("desc").take(101);
  // A bounded activity log; no questions, answers or project media are persisted.
  for (const row of rows.slice(99)) await ctx.db.delete(row._id);
  return await ctx.db.insert("agentRuns", { workspaceId, owner, createdAt: now, status: "pending", provider: "groq", model: groqProvider.model, inputTokens: 0, outputTokens: 0 });
} });
export const finish = internalMutation({ args: { id: v.id("agentRuns"), success: v.boolean(), inputTokens: v.number(), outputTokens: v.number() }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.id);
  if (row) await ctx.db.patch(args.id, { status: args.success ? "completed" : "failed", inputTokens: args.inputTokens, outputTokens: args.outputTokens });
} });
