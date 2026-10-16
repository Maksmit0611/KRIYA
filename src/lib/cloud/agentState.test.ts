import { afterEach, expect, mock, test } from "bun:test";
import { defineTestApp } from "convex-test";
import schema from "../../convex/schema";
import * as agentState from "../../convex/agentState";
import * as agentKnowledge from "../../convex/agentKnowledge";
import * as brain from "../../convex/brain";
import { summarizeProject } from "../agent/brain";
import { createInitialState } from "../project/initial";
const app = defineTestApp({ schema }).defineModules({ agentState, agentKnowledge, brain });
afterEach(() => { delete process.env.GROQ_API_KEY; delete process.env.GROQ_FREE_PLAN_CONFIRMED; delete process.env.AGENT_ALLOWED_SUBJECTS; });

test("memory is scoped to both authenticated workspace and owner", async () => {
  const t = app.createTest();
  await expect(t.query(app.api.agentState.notes, {})).rejects.toThrow();
  const a = t.withIdentity({ subject: "user_a", workspaceId: "org_a" });
  const b = t.withIdentity({ subject: "user_b", workspaceId: "org_a" });
  const other = t.withIdentity({ subject: "user_a", workspaceId: "org_b" });
  const id = await a.mutation(app.api.agentState.remember, { text: "Prefer calm pacing" });
  expect((await a.query(app.api.agentState.notes, {})).length).toBe(1);
  expect(await b.query(app.api.agentState.notes, {})).toEqual([]);
  expect(await other.query(app.api.agentState.notes, {})).toEqual([]);
  await expect(b.mutation(app.api.agentState.forget, { id })).rejects.toThrow();
  await expect(other.mutation(app.api.agentState.forget, { id })).rejects.toThrow();
  await expect(a.mutation(app.api.agentState.remember, { text: " " })).rejects.toThrow();
  await expect(a.mutation(app.api.agentState.remember, { text: "a".repeat(501) })).rejects.toThrow();
  await a.mutation(app.api.agentState.forget, { id });
  expect(await a.query(app.api.agentState.notes, {})).toEqual([]);
});

test("cloud brain fails closed before a provider request without consent/config/auth", async () => {
  const t = app.createTest();
  const a = t.withIdentity({ subject: "user_a", workspaceId: "org_a" });
  const args = { question: "Help with export", summary: summarizeProject(createInitialState()), consent: false };
  const originalFetch = globalThis.fetch;
  const fetchSpy = mock(async () => { throw new Error("Unexpected network request"); });
  globalThis.fetch = Object.assign(fetchSpy, { preconnect: () => {} });
  try {
    await expect(t.action(app.api.brain.ask, args)).rejects.toThrow();
    await expect(a.action(app.api.brain.ask, args)).rejects.toThrow("Confirm");
    await expect(a.action(app.api.brain.ask, { ...args, consent: true })).rejects.toThrow("limited");
    process.env.AGENT_ALLOWED_SUBJECTS = "user_a";
    await expect(a.action(app.api.brain.ask, { ...args, consent: true })).rejects.toThrow("Free-plan");
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { globalThis.fetch = originalFetch; }
});

test("atomic budgets restrict repeated requests and shared usage", async () => {
  const t = app.createTest();
  const scope = { workspaceId: "org_a", owner: "user_a" };
  await t.mutation(app.internal.agentState.reserve, scope);
  await t.mutation(app.internal.agentState.reserve, scope);
  await t.mutation(app.internal.agentState.reserve, scope);
  await expect(t.mutation(app.internal.agentState.reserve, scope)).rejects.toThrow("budget");
  await t.mutation(app.internal.agentState.reserve, { ...scope, owner: "user_b" });
  await t.mutation(app.internal.agentState.reserve, { ...scope, owner: "user_b" });
  await t.mutation(app.internal.agentState.reserve, { ...scope, owner: "user_b" });
  await expect(t.mutation(app.internal.agentState.reserve, { ...scope, owner: "user_c" })).rejects.toThrow("budget");
});

test("a complete mocked cloud request uses explicit memory and records only run metadata", async () => {
  const t = app.createTest();
  const a = t.withIdentity({ subject: "user_a", workspaceId: "org_a" });
  process.env.GROQ_API_KEY = "test-key-not-a-real-credential";
  process.env.GROQ_FREE_PLAN_CONFIRMED = "true";
  process.env.AGENT_ALLOWED_SUBJECTS = "user_a";
  await a.mutation(app.api.agentState.remember, { text: "Prefer calm pacing" });
  const originalFetch = globalThis.fetch;
  const fetchSpy = mock(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(init!.body as string).toContain("Prefer calm pacing");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "Review shot length.", citations: ["kriya-pacing"], edit: "none", speed: null }) } }], usage: { prompt_tokens: 123, completion_tokens: 20 } }));
  });
  globalThis.fetch = Object.assign(fetchSpy, { preconnect: () => {} });
  try {
    const result = await a.action(app.api.brain.ask, { question: "Improve pacing", summary: summarizeProject(createInitialState()), consent: true });
    expect(result.answer).toBe("Review shot length.");
    const status = await a.query(app.api.agentState.status, {});
    expect(status.runs[0].status).toBe("completed");
    expect(status.runs[0].inputTokens).toBe(123);
    expect(JSON.stringify(status.runs)).not.toContain("Prefer calm pacing");
    expect(JSON.stringify(status.runs)).not.toContain("Review shot length");
  } finally { globalThis.fetch = originalFetch; }
});

 test("private knowledge import is atomic, licensed, scoped and removable", async () => {
  const t = app.createTest();
  const a = t.withIdentity({ subject: "user_a", workspaceId: "org_a" });
  const b = t.withIdentity({ subject: "user_b", workspaceId: "org_a" });
  const item = { title: "House style", body: "Prefer short titles.", tags: ["titles"], sourceUrl: "https://example.com/our-guide", license: "User-owned" as const };
  await expect(a.mutation(app.api.agentKnowledge.ingest, { records: [item], rightsConfirmed: false })).rejects.toThrow();
  await expect(a.mutation(app.api.agentKnowledge.ingest, { records: [item, { ...item, sourceUrl: "javascript:alert(1)" }], rightsConfirmed: true })).rejects.toThrow();
  expect(await a.query(app.api.agentKnowledge.list, {})).toEqual([]);
  expect(await a.mutation(app.api.agentKnowledge.ingest, { records: [item], rightsConfirmed: true })).toBe(1);
  const rows = await a.query(app.api.agentKnowledge.list, {});
  expect(await b.query(app.api.agentKnowledge.list, {})).toEqual([]);
  await expect(b.mutation(app.api.agentKnowledge.remove, { id: rows[0]._id })).rejects.toThrow();
  await a.mutation(app.api.agentKnowledge.remove, { id: rows[0]._id });
  expect(await a.query(app.api.agentKnowledge.list, {})).toEqual([]);
});
