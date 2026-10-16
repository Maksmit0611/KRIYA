import { v } from "convex/values";
import { mutation, query, internalQuery } from "./lib/builders";
import { requireWorkspace } from "../lib/cloud/contracts";
const record = v.object({ title: v.string(), body: v.string(), tags: v.array(v.string()), sourceUrl: v.string(), license: v.union(v.literal("CC0-1.0"), v.literal("User-owned")) });
export const list = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  return await ctx.db.query("agentKnowledge").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", identity!.subject)).take(100);
} });
export const ingest = mutation({ args: { records: v.array(record), rightsConfirmed: v.boolean() }, handler: async (ctx, { records, rightsConfirmed }) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  if (!rightsConfirmed) throw new Error("Confirm your right to use these records.");
  if (!records.length || records.length > 20) throw new Error("Import 1–20 records at a time.");
  const current = await ctx.db.query("agentKnowledge").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", identity!.subject)).take(100);
  if (current.length + records.length > 100) throw new Error("Knowledge limit is 100 private records. Delete unused entries first.");
  for (const item of records) {
    if (!item.title.trim() || item.title.length > 200 || !item.body.trim() || item.body.length > 2000 || item.tags.length > 12 || item.tags.some((tag) => !tag.trim() || tag.length > 60)) throw new Error("Invalid knowledge record length.");
    const url = new URL(item.sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password || item.sourceUrl.length > 2000) throw new Error("Use a public HTTPS source reference without credentials. URLs are never fetched.");
    await ctx.db.insert("agentKnowledge", { ...item, workspaceId, owner: identity!.subject, createdAt: Date.now() });
  }
  return records.length;
} });
export const remove = mutation({ args: { id: v.id("agentKnowledge") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity();
  const workspaceId = requireWorkspace(identity);
  const row = await ctx.db.get(id);
  if (!row || row.workspaceId !== workspaceId || row.owner !== identity!.subject) throw new Error("Knowledge unavailable.");
  await ctx.db.delete(id);
} });
export const context = internalQuery({ args: { workspaceId: v.string(), owner: v.string() }, handler: async (ctx, { workspaceId, owner }) => {
  const rows = await ctx.db.query("agentKnowledge").withIndex("by_scope", (q) => q.eq("workspaceId", workspaceId).eq("owner", owner)).take(100);
  return rows.map((row) => ({ id: `user-${row._id}`, title: row.title, body: row.body, tags: row.tags, sourceUrl: row.sourceUrl, license: row.license, category: "private knowledge", reviewStatus: "user-confirmed" }));
} });
