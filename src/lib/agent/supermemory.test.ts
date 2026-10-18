import { describe, expect, test } from "bun:test";
import { addSupermemory, deleteSupermemory, memoryNamespace, searchSupermemory } from "./supermemory";

describe("Supermemory v5 adapter", () => {
  test("derives opaque stable namespaces without exposing identity", async () => {
    const first = await memoryNamespace("org_secret", "user_secret");
    expect(first).toBe(await memoryNamespace("org_secret", "user_secret"));
    expect(first).not.toContain("org_secret");
    expect(first).not.toContain("user_secret");
    expect(first).toMatch(/^kriya_[a-f0-9]{48}$/);
  });
  test("uses bounded v5 add, search and delete requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/search")) return new Response(JSON.stringify({ results: [{ id: "m1", memory: "Prefers calm pacing", similarity: 0.9 }, { id: 4, memory: "bad", similarity: 1 }] }));
      return new Response(JSON.stringify({ id: "note-1", status: "queued", count: 1, errors: [] }));
    };
    await addSupermemory("key", "namespace", "note-1", "Prefers calm pacing", fetcher);
    expect((JSON.parse(calls[0].init?.body as string)).metadata.source).toBe("kriya");
    expect(await searchSupermemory("key", "namespace", "pacing", fetcher)).toEqual([{ id: "m1", text: "Prefers calm pacing", similarity: 0.9 }]);
    const searchBody = JSON.parse(calls[1].init?.body as string);
    expect(searchBody).toMatchObject({ searchMode: "memories", limit: 5, threshold: 0.6, rerank: "none", rewriteQuery: false });
    await deleteSupermemory("key", "namespace", "note-1", fetcher);
    expect(calls[2].init?.method).toBe("DELETE");
  });
});
