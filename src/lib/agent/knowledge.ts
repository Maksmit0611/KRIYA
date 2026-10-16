import editor from "../../../data/knowledge/editor.json";
import glossary from "../../../data/knowledge/wikidata.json";

export interface KnowledgeRecord { id: string; title: string; category: string; tags: string[]; body: string; sourceUrl: string; license: string; reviewStatus: string }
export const knowledge: KnowledgeRecord[] = [...editor.records, ...glossary.records];
const stopWords = new Set(["the", "a", "an", "how", "do", "i", "my", "to", "and", "of", "is", "it", "can", "you", "what", "for", "with", "me"]);
const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !stopWords.has(word)) ?? [];

export function searchKnowledge(question: string, limit = 4): KnowledgeRecord[] {
  return rankKnowledge(question, knowledge, limit);
}
export function rankKnowledge(question: string, records: KnowledgeRecord[], limit = 4): KnowledgeRecord[] {
  const terms = [...new Set(words(question))];
  if (!terms.length) return [];
  return records.map((record) => {
    const title = words(record.title + " " + record.tags.join(" "));
    const body = words(record.body);
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : 0) + (body.includes(term) ? 1 : 0), 0);
    return { record, score };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id)).slice(0, Math.max(0, Math.min(8, limit))).map(({ record }) => record);
}
