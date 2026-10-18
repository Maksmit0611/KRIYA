import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentKnowledge: defineTable({ workspaceId: v.string(), owner: v.string(), title: v.string(), body: v.string(), tags: v.array(v.string()), sourceUrl: v.string(), license: v.string(), createdAt: v.number() })
    .index("by_scope", ["workspaceId", "owner"]),
  agentMemory: defineTable({ workspaceId: v.string(), owner: v.string(), text: v.string(), externalId: v.optional(v.string()), createdAt: v.number() })
    .index("by_scope", ["workspaceId", "owner"]),
  agentBudget: defineTable({ scope: v.string(), day: v.string(), count: v.number(), minute: v.number(), minuteCount: v.number() })
    .index("by_scope", ["scope"]),
  agentRuns: defineTable({ workspaceId: v.string(), owner: v.string(), createdAt: v.number(), status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")), provider: v.string(), model: v.string(), inputTokens: v.number(), outputTokens: v.number() })
    .index("by_scope", ["workspaceId", "owner"]),
  checkpoints: defineTable({
    workspaceId: v.string(), projectId: v.string(), snapshot: v.string(),
    revision: v.number(), savedAt: v.number(), savedBy: v.string(),
  }).index("by_workspace_project", ["workspaceId", "projectId"]),
});
