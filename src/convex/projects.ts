import type { DataModelFromSchemaDefinition, MutationBuilder, QueryBuilder } from "convex/server";
import schema from "./schema";
import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import { assertRevision, requireWorkspace, validateCheckpoint } from "../lib/cloud/contracts";

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query: QueryBuilder<DataModel, "public"> = queryGeneric;
const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;

export const get = query({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const workspaceId = requireWorkspace(await ctx.auth.getUserIdentity());
    return await ctx.db.query("checkpoints").withIndex("by_workspace_project", (q) =>
      q.eq("workspaceId", workspaceId).eq("projectId", projectId)).unique();
  },
});

export const save = mutation({
  args: { projectId: v.string(), snapshot: v.string(), expectedRevision: v.union(v.number(), v.null()) },
  handler: async (ctx, { projectId, snapshot, expectedRevision }) => {
    const identity = await ctx.auth.getUserIdentity();
    const workspaceId = requireWorkspace(identity);
    validateCheckpoint(snapshot, projectId, workspaceId);
    const current = await ctx.db.query("checkpoints").withIndex("by_workspace_project", (q) =>
      q.eq("workspaceId", workspaceId).eq("projectId", projectId)).unique();
    assertRevision(current?.revision ?? null, expectedRevision);
    const revision = (current?.revision ?? 0) + 1;
    const fields = { workspaceId, projectId, snapshot, revision, savedAt: Date.now(), savedBy: identity!.subject };
    if (current) await ctx.db.replace(current._id, fields);
    else await ctx.db.insert("checkpoints", fields);
    return revision;
  },
});
