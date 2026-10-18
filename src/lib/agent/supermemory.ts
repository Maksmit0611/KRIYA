export interface SupermemoryResult { id: string; text: string; similarity: number }
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function checkedJson(response: Response): Promise<any> {
  if (!response.ok) throw new Error(response.status === 429 ? "Memory quota reached." : "Memory service unavailable.");
  const text = await response.text();
  if (text.length > 100_000) throw new Error("Memory response too large.");
  return JSON.parse(text);
}

export async function memoryNamespace(workspaceId: string, owner: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${workspaceId}\u0000${owner}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `kriya_${Array.from(new Uint8Array(hash)).map((value) => value.toString(16).padStart(2, "0")).join("").slice(0, 48)}`;
}

export async function addSupermemory(apiKey: string, namespace: string, id: string, text: string, fetcher: Fetcher = fetch): Promise<void> {
  await checkedJson(await fetcher(`https://api.supermemory.ai/ns/${encodeURIComponent(namespace)}/document`, {
    method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, content: text, metadata: { source: "kriya", kind: "explicit_preference" } }),
  }));
}

export async function searchSupermemory(apiKey: string, namespace: string, query: string, fetcher: Fetcher = fetch): Promise<SupermemoryResult[]> {
  const data = await checkedJson(await fetcher(`https://api.supermemory.ai/ns/${encodeURIComponent(namespace)}/search`, {
    method: "POST", signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, searchMode: "memories", limit: 5, threshold: 0.6, rerank: "none", rewriteQuery: false }),
  }));
  if (!Array.isArray(data.results)) return [];
  return data.results.slice(0, 5).flatMap((item: any) => {
    const text = typeof item?.memory === "string" ? item.memory : typeof item?.chunk === "string" ? item.chunk : "";
    const similarity = Number(item?.similarity);
    return typeof item?.id === "string" && text && text.length <= 2_000 && Number.isFinite(similarity) ? [{ id: item.id, text, similarity }] : [];
  });
}

export async function deleteSupermemory(apiKey: string, namespace: string, id: string, fetcher: Fetcher = fetch): Promise<void> {
  const data = await checkedJson(await fetcher(`https://api.supermemory.ai/ns/${encodeURIComponent(namespace)}/document`, {
    method: "DELETE", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [id] }),
  }));
  if (Array.isArray(data.errors) && data.errors.length) throw new Error("Memory is still processing; retry forgetting shortly.");
}
