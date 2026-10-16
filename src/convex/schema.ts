import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  checkpoints: defineTable({
    workspaceId: v.string(), projectId: v.string(), snapshot: v.string(),
    revision: v.number(), savedAt: v.number(), savedBy: v.string(),
  }).index("by_workspace_project", ["workspaceId", "projectId"]),
});
