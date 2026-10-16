import { describe, expect, test } from "bun:test";
import type { UserIdentity } from "convex/server";
import { createInitialState } from "../project/initial";
import { assertRevision, checkpointSnapshot, requireWorkspace, validateCheckpoint } from "./contracts";

const identity = (workspaceId?: unknown) => ({ subject: "user_test", issuer: "https://example.clerk.accounts.dev", tokenIdentifier: "test", workspaceId }) as UserIdentity;
describe("cloud checkpoint boundary", () => {
  test("rejects anonymous and missing organization claims", () => {
    expect(() => requireWorkspace(null)).toThrow();
    for (const claim of [undefined, null, "", "workspace_local", 123]) expect(() => requireWorkspace(identity(claim))).toThrow();
    expect(requireWorkspace(identity("org_a"))).toBe("org_a");
  });
  test("scopes a copy of local metadata without mutating local state", () => {
    const state = createInitialState();
    const before = JSON.stringify(state);
    const snapshot = checkpointSnapshot(state, "org_a");
    validateCheckpoint(snapshot, state.project.id, "org_a");
    expect(JSON.stringify(state)).toBe(before);
    expect(() => validateCheckpoint(snapshot, state.project.id, "org_b")).toThrow();
    expect(() => validateCheckpoint(snapshot, "another-project", "org_a")).toThrow();
    const foreign = JSON.parse(snapshot);
    expect(() => checkpointSnapshot(foreign, "org_b")).toThrow();
  });
  test("server rejects malformed, inconsistent and oversized snapshots", () => {
    const state = createInitialState();
    expect(() => validateCheckpoint("{}", state.project.id, "org_a")).toThrow();
    state.project.activeVersion = 99;
    expect(() => checkpointSnapshot(state, "org_a")).toThrow();
    expect(() => validateCheckpoint("é".repeat(400000), "p", "org_a")).toThrow("750 KB");
  });
  test("create and update require the exact previous revision", () => {
    expect(() => assertRevision(null, null)).not.toThrow();
    expect(() => assertRevision(2, 2)).not.toThrow();
    expect(() => assertRevision(1, null)).toThrow();
    expect(() => assertRevision(null, 1)).toThrow();
    expect(() => assertRevision(2, 1)).toThrow();
  });
});
