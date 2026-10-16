import type { UserIdentity } from "convex/server";
import type { StoredEditorState } from "../project/types";
import { assertStoredEditorState } from "../project/validation";

export function requireWorkspace(identity: UserIdentity | null): string {
  if (!identity) throw new Error("Sign in before using cloud checkpoints.");
  const workspace = identity.workspaceId;
  if (typeof workspace !== "string" || !workspace.startsWith("org_")) {
    throw new Error("Select an organization and configure the convex JWT workspaceId claim.");
  }
  return workspace;
}

export function checkpointSnapshot(state: StoredEditorState, workspaceId: string): string {
  assertStoredEditorState(state);
  if (state.project.workspaceId !== "workspace_local" && state.project.workspaceId !== workspaceId) {
    throw new Error("Project belongs to a different workspace.");
  }
  // Copy only: saving a checkpoint never changes the local project or original media.
  const snapshot = { ...state, project: { ...state.project, workspaceId },
    assets: state.assets.map((asset) => ({ ...asset, workspaceId })) };
  return JSON.stringify(snapshot);
}

export function validateCheckpoint(snapshot: string, projectId: string, workspaceId: string): void {
  // Leave headroom under Convex's document size limit, including UTF-8 and row metadata.
  if (new TextEncoder().encode(snapshot).length > 750_000) throw new Error("Checkpoint exceeds 750 KB. Export the project manifest instead.");
  const state: unknown = JSON.parse(snapshot);
  assertStoredEditorState(state);
  if (state.project.id !== projectId || state.project.workspaceId !== workspaceId) {
    throw new Error("Checkpoint project or workspace does not match authenticated scope.");
  }
}

export function assertRevision(actual: number | null, expected: number | null): void {
  if (actual !== expected) throw new Error("Cloud checkpoint changed. Check cloud again before saving.");
}
