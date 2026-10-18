import { Component, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery, useConvexAuth } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import type { StoredEditorState } from "../lib/project/types";
import { cloudConfigured } from "../lib/cloud/CloudProvider";
import type { KnowledgeRecord } from "../lib/agent/knowledge";
import { knowledge, rankKnowledge } from "../lib/agent/knowledge";
import { offlineAdvice, suggestedRequest, summarizeProject } from "../lib/agent/brain";
import type { BrainReply, ProjectSummary } from "../lib/agent/brain";
import { readLocalMemory, writeLocalMemory } from "../lib/agent/memory";
import skills from "../../data/agent/skills.json";
import design from "../../data/design/system.json";
import "./AgentStudio.css";

type Note = { id: string; text: string };
type Activity = { status: string; inputTokens: number; outputTokens: number; createdAt: number };
type ProviderStatus = { id: string; label: string; model: string; freeFirst: boolean; configured: boolean };
type PrivateInput = { title: string; body: string; tags: string[]; sourceUrl: string; license: "CC0-1.0" | "User-owned" };
interface Cloud { entries: (KnowledgeRecord & { dbId: string })[]; ingest: (records: PrivateInput[]) => Promise<number>; removeKnowledge: (id: string) => Promise<unknown>; ready: boolean; providers: ProviderStatus[]; supermemoryConfigured: boolean; notes: Note[]; runs: Activity[]; ask: (provider: string, question: string, summary: ProjectSummary) => Promise<BrainReply>; remember: (text: string) => Promise<unknown>; forget: (id: string) => Promise<unknown> }
interface Props { state: StoredEditorState; playheadMs: number; onPreview: (request: string) => void }
const notesRef = makeFunctionReference<"query", Record<string, never>, { _id: GenericId<"agentMemory">; text: string }[]>("agentState:notes");
const statusRef = makeFunctionReference<"query", Record<string, never>, { providers: ProviderStatus[]; supermemoryConfigured: boolean; runs: Activity[] }>("agentState:status");
const rememberRef = makeFunctionReference<"action", { text: string }, GenericId<"agentMemory">>("memory:remember");
const forgetRef = makeFunctionReference<"action", { id: GenericId<"agentMemory"> }, null>("memory:forget");
const askRef = makeFunctionReference<"action", { provider: string; question: string; summary: ProjectSummary; consent: boolean }, BrainReply>("brain:ask");

const listKnowledgeRef = makeFunctionReference<"query", Record<string, never>, (PrivateInput & { _id: GenericId<"agentKnowledge"> })[]>("agentKnowledge:list");
const ingestRef = makeFunctionReference<"mutation", { records: PrivateInput[]; rightsConfirmed: boolean }, number>("agentKnowledge:ingest");
const removeKnowledgeRef = makeFunctionReference<"mutation", { id: GenericId<"agentKnowledge"> }, null>("agentKnowledge:remove");

export function AgentStudio(props: Props) { return cloudConfigured ? <CloudStudio {...props} /> : <Studio {...props} cloud={null} />; }
function CloudStudio(props: Props) {
  const { userId, orgId } = useAuth();
  return <CloudBoundary key={`${userId}:${orgId}:${props.state.project.id}`} fallback={<><p className="agent-error" role="status">Cloud tools are unavailable. Deploy the backend and check the organization claim. Offline knowledge is still available.</p><Studio {...props} cloud={null} /></>}><CloudSession {...props} orgId={orgId} /></CloudBoundary>;
}
class CloudBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function CloudSession({ orgId, ...props }: Props & { orgId: string | null | undefined }) {
  const { isAuthenticated } = useConvexAuth();
  const ready = isAuthenticated && Boolean(orgId);
  const notes = useQuery(notesRef, ready ? {} : "skip");
  const status = useQuery(statusRef, ready ? {} : "skip");
  const entries = useQuery(listKnowledgeRef, ready ? {} : "skip");
  const ingest = useMutation(ingestRef);
  const removeKnowledge = useMutation(removeKnowledgeRef);
  const remember = useAction(rememberRef);
  const forget = useAction(forgetRef);
  const ask = useAction(askRef);
  return <Studio {...props} cloud={{ entries: (entries ?? []).map((row) => ({ ...row, dbId: row._id, id: `user-${row._id}`, category: "private knowledge", reviewStatus: "user-confirmed" })), ingest: (records) => ingest({ records, rightsConfirmed: true }), removeKnowledge: (id) => removeKnowledge({ id: id as GenericId<"agentKnowledge"> }), ready, providers: status?.providers ?? [], supermemoryConfigured: status?.supermemoryConfigured ?? false, notes: (notes ?? []).map((note) => ({ id: note._id, text: note.text })), runs: status?.runs ?? [], ask: (provider, question, summary) => ask({ provider, question, summary, consent: true }), remember: (text) => remember({ text }), forget: (id) => forget({ id: id as GenericId<"agentMemory"> }) }} />;
}

function Studio({ state, playheadMs, onPreview, cloud }: Props & { cloud: Cloud | null }) {
  const [tab, setTab] = useState("Overview");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("offline");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ reply: BrainReply; fingerprint: string } | null>(null);
  const [localNotes, setLocalNotes] = useState(() => readLocalMemory(state.project.id));
  const [memoryScope, setMemoryScope] = useState<"local" | "cloud">("local");
  const [note, setNote] = useState("");
  const [importJson, setImportJson] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const fingerprint = `${state.project.id}:${state.timeline.version}:${state.selectedClipId}:${playheadMs}`;
  const summary = summarizeProject(state);
  const allKnowledge = [...knowledge, ...(cloud?.entries ?? [])];
  const records = rankKnowledge(question, allKnowledge);
  const memory = memoryScope === "cloud" ? cloud?.notes ?? [] : localNotes;
  const request = result ? suggestedRequest(result.reply) : null;
  const stale = result?.fingerprint !== fingerprint;
  const style = { "--agent-accent": design.colors.accent, "--agent-bg": design.colors.surface, "--agent-border": design.colors.border, "--agent-radius": design.radius, "--agent-motion": design.motion.duration, "--agent-ease": design.motion.easing } as CSSProperties;
  async function ask() {
    setBusy(true); setError(""); setResult(null);
    try {
      const reply = mode !== "offline" ? await cloud!.ask(mode, question, summary) : offlineAdvice(question, allKnowledge);
      setResult({ reply, fingerprint });
    } catch { setError("Cloud reasoning is unavailable. Check deployment, authentication, configuration or quota. Offline knowledge still works."); }
    finally { setBusy(false); }
  }
  async function changeMemory(removeId?: string) {
    setError(""); setBusy(true);
    try {
      if (memoryScope === "cloud") {
        if (!cloud?.ready) throw new Error("Sign in and select a workspace.");
        if (removeId) await cloud.forget(removeId); else await cloud.remember(note.trim());
      } else {
        const next = removeId ? localNotes.filter((item) => item.id !== removeId) : [...localNotes, { id: crypto.randomUUID(), text: note.trim() }];
        writeLocalMemory(state.project.id, next); setLocalNotes(next);
      }
      setNote("");
    } catch { setError("Memory could not be changed. Use up to 12 notes of 500 characters; cloud memory also needs sign-in and a workspace."); }
    finally { setBusy(false); }
  }
  async function importRecords() {
    setBusy(true); setError(""); setImportMessage("");
    try {
      if (!rightsConfirmed || !cloud?.ready || importJson.length > 100_000) throw new Error("Import unavailable.");
      const records: unknown = JSON.parse(importJson);
      if (!Array.isArray(records)) throw new Error("Use a JSON array.");
      const count = await cloud.ingest(records as PrivateInput[]);
      setImportJson(""); setRightsConfirmed(false); setImportMessage(`Imported ${count} private knowledge records.`);
    } catch { setError("Import failed. Use 1–20 licensed JSON records, each with title, body (up to 2000 characters), tags, HTTPS sourceUrl and license (CC0-1.0 or User-owned). Limit: 100 private records."); }
    finally { setBusy(false); }
  }
  return <div className="agent-studio" style={style}>
    <div className="studio-banner"><div><span className="studio-kicker">YOUR CREATIVE COPILOT</span><h3>Make the next cut count.</h3><p>Grounded knowledge. Deliberate edits. You stay in control.</p></div><span className="studio-mode"><i />{mode === "offline" ? "Offline knowledge" : cloud?.providers.find((provider) => provider.id === mode)?.label ?? "Cloud model"}</span></div>
    <nav className="studio-tabs" aria-label="Agent sections">{design.sections.map((name) => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {tab === "Overview" && <>
      <div className="studio-metrics">{[["Clips", summary.clips], ["Assets", summary.assets], ["Duration", `${(summary.durationMs / 1000).toFixed(1)}s`], ["Knowledge", allKnowledge.length]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="studio-chart"><div className="studio-section-title">Timeline composition <span>clips per track</span></div><svg viewBox={`0 0 500 ${Math.max(42, state.timeline.tracks.length * 28)}`} role="img" aria-label="Actual clip counts per timeline track">{state.timeline.tracks.map((track, index) => { const max = Math.max(1, ...state.timeline.tracks.map((item) => item.clips.length)); return <g key={track.id} transform={`translate(0 ${index * 28})`}><text x="0" y="17" fill="#aaa" fontSize="11">{track.name.slice(0, 15)}</text><rect x="125" y="5" width={track.clips.length / max * 330} height="14" rx="3" fill={design.colors.accent} /><text x="470" y="17" fill="#eee" fontSize="11">{track.clips.length}</text></g>; })}</svg></div>
      <label className="studio-section-title" htmlFor="studio-question">Ask KRIYA <span>editing, delivery, workflow</span></label>
      <textarea id="studio-question" value={question} maxLength={2000} onChange={(event) => { setQuestion(event.target.value); setResult(null); }} placeholder="How should I review pacing and prepare a vertical edit?" />
      <div className="studio-suggestions">{["Review my export options", "How do I back up my project?", "Improve pacing"].map((value) => <button key={value} onClick={() => { setQuestion(value); setResult(null); }}>{value}</button>)}</div>
      <div className="studio-controls"><select aria-label="Brain mode" value={mode} onChange={(event) => { setMode(event.target.value); setResult(null); }}><option value="offline">Offline knowledge · no API</option>{cloud?.providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.configured}>{provider.label}{provider.freeFirst ? " · free-first" : " · owner-configured"}{provider.configured ? "" : " · unavailable"}</option>)}</select><button className="primary-button" disabled={busy || !question.trim() || (mode !== "offline" && (!cloud?.ready || !cloud.providers.some((provider) => provider.id === mode && provider.configured) || !consent))} onClick={() => void ask()}>{busy ? "WORKING…" : mode !== "offline" ? "ASK MODEL" : "SEARCH KNOWLEDGE"}</button></div>
      {mode !== "offline" ? <label className="studio-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />Send this question, numerical project summary, matched knowledge and my cloud notes to {cloud?.providers.find((provider) => provider.id === mode)?.label ?? "the selected provider"}. No media files. That provider's data terms and configured billing apply.</label> : <p className="studio-hint">Offline mode retrieves reviewed guidance; it does not run a language model. {cloud?.providers.some((provider) => provider.configured) ? "Cloud reasoning is available in the selector." : "Cloud reasoning needs Clerk/Convex, an allowed user and a server-only provider key configured by the owner."}</p>}
      {result && <article className="studio-answer" aria-live="polite"><span className="studio-kicker">{mode === "offline" ? "KNOWLEDGE MATCHES" : "MODEL RESPONSE · REVIEW BEFORE USE"}</span><p>{result.reply.answer}</p><div className="studio-sources">{result.reply.citations.map((id) => { const record = allKnowledge.find((item) => item.id === id); return record ? <a key={id} href={record.sourceUrl} target="_blank" rel="noreferrer">{record.title} ↗</a> : null; })}</div>{request && <button className="secondary-button" disabled={stale} onClick={() => onPreview(request)}>{stale ? "Context changed — ask again" : "PREVIEW SUGGESTED EDIT"}</button>}</article>}
      {cloud?.runs.length ? <div className="studio-activity"><div className="studio-section-title">Recent cloud activity <span>actual recorded runs</span></div>{cloud.runs.slice(0, 5).map((run, index) => <div key={index}><time>{new Date(run.createdAt).toLocaleTimeString()}</time><span>{run.status}</span><span>{run.inputTokens + run.outputTokens} tokens</span></div>)}</div> : null}
    </>}
    {tab === "Knowledge" && <><div className="studio-section-title">Knowledge library <span>{allKnowledge.length} source-backed records</span></div><input aria-label="Search knowledge" value={question} maxLength={2000} onChange={(event) => setQuestion(event.target.value)} placeholder="Search codecs, captions, pacing…" /><p className="studio-hint">Original KRIYA guidance and acquired CC0 Wikidata definitions. Retrieval adds context; it does not train model weights.</p><div className="studio-records">{(question.trim() ? records : allKnowledge).map((record) => <article key={record.id}><span className="studio-kicker">{record.category} · {record.license}</span><h4>{record.title}</h4><p>{record.body}</p><a href={record.sourceUrl} target="_blank" rel="noreferrer">Source reference ↗</a>{"dbId" in record && <button className="secondary-button" disabled={busy} onClick={() => { setBusy(true); void cloud!.removeKnowledge(String(record.dbId)).catch(() => setError("Knowledge could not be deleted.")).finally(() => setBusy(false)); }}>DELETE RECORD</button>}</article>)}</div><div className="studio-import"><div className="studio-section-title">Feed your knowledge <span>private to your workspace user</span></div><p className="studio-hint">Paste a JSON array or choose a JSON file. Import your own material or CC0 data only. Each record needs title, body, tags, sourceUrl and license. Cloud sign-in is required; no model key is needed to store knowledge.</p><input type="file" accept=".json,application/json" aria-label="Import knowledge JSON file" disabled={!cloud?.ready || busy} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 100000) { setError("Import file must be under 100 KB."); return; } void file.text().then(setImportJson).catch(() => setError("Could not read file.")); }} /><textarea aria-label="Knowledge JSON" value={importJson} maxLength={100000} onChange={(event) => setImportJson(event.target.value)} placeholder={'[{"title":"Our style","body":"Use concise titles.","tags":["titles"],"sourceUrl":"https://example.com/our-guide","license":"User-owned"}]'} /><label className="studio-consent"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />I own this material or have confirmed its CC0 license and permission to use it.</label><button className="secondary-button" disabled={!cloud?.ready || busy || !rightsConfirmed || !importJson.trim()} onClick={() => void importRecords()}>IMPORT KNOWLEDGE</button><p role="status">{importMessage}</p></div></>}
    {tab === "Skills" && <><div className="studio-section-title">Skills & tools <span>explicit permissions</span></div><div className="studio-records">{skills.map((skill) => <article key={skill.id}><span className="studio-kicker">{skill.permission}</span><h4>{skill.title}</h4><p>{skill.id === "brain.reason" ? (cloud?.providers.some((provider) => provider.configured) ? "Configured; live model requires your request." : "Needs cloud configuration.") : "Implemented"}</p><code>{skill.id}</code></article>)}</div><p className="studio-hint">No shell, arbitrary URLs, publishing, media generation or unapproved timeline writes. Use Edit preview to inspect supported edits.</p></>}
    {tab === "Memory" && <><div className="studio-section-title">An explicit creative brief <span>{memory.length}/12 notes</span></div><select aria-label="Memory scope" value={memoryScope} onChange={(event) => setMemoryScope(event.target.value as typeof memoryScope)}><option value="local">This project · this browser</option><option value="cloud" disabled={!cloud?.ready}>My cloud workspace notes</option></select><p className="studio-hint">Only notes you add are remembered. Cloud notes are private to your user within the active workspace and are sent with cloud questions. {cloud?.supermemoryConfigured ? "Supermemory is enabled for semantic recall; its processing can take time." : "Convex is the active cloud-memory store."} Local notes are not sent. Never store passwords or keys here.</p><textarea aria-label="New memory note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="For example: Prefer calm pacing and concise titles." /><button className="secondary-button" disabled={busy || !note.trim() || memory.length >= 12} onClick={() => void changeMemory()}>REMEMBER NOTE</button><div className="studio-notes">{memory.map((item) => <article key={item.id}><p>{item.text}</p><button aria-label={`Forget note: ${item.text}`} disabled={busy} onClick={() => void changeMemory(item.id)}>Forget</button></article>)}</div></>}
    {error && <p className="agent-error" role="alert">{error}</p>}
  </div>;
}
