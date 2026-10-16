export interface LocalMemory { id: string; text: string }
export function readLocalMemory(projectId: string): LocalMemory[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`kriya-agent-memory:${projectId}`) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((note): note is LocalMemory => note && typeof note.id === "string" && typeof note.text === "string" && note.text.length <= 500).slice(0, 12);
  } catch { return []; }
}
export function writeLocalMemory(projectId: string, notes: LocalMemory[]): void {
  if (notes.length > 12 || notes.some((note) => !note.text.trim() || note.text.length > 500)) throw new Error("Use up to 12 notes, 1–500 characters each.");
  localStorage.setItem(`kriya-agent-memory:${projectId}`, JSON.stringify(notes));
}
