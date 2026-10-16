import { useEffect, useRef, useState } from "react";
import type { StoredEditorState } from "../lib/project/types";
import { proposeLocalEdit } from "../lib/agent/local";
import type { LocalEditProposal } from "../lib/agent/local";
import "./AgentPanel.css";
import { AgentStudio } from "./AgentStudio";

interface AgentPanelProps {
  state: StoredEditorState;
  playheadMs: number;
  onApply: (proposal: LocalEditProposal) => void;
  onClose: () => void;
}

export function AgentPanel({ state, playheadMs, onApply, onClose }: AgentPanelProps) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  const [view, setView] = useState<"studio" | "edit">("studio");
  const [request, setRequest] = useState("");
  const [proposal, setProposal] = useState<LocalEditProposal | null>(null);
  const [error, setError] = useState("");
  const stale = proposal !== null && (proposal.command.projectId !== state.project.id || proposal.command.timelineVersion !== state.timeline.version || proposal.targetClipId !== state.selectedClipId);

  const preview = () => {
    try {
      setProposal(proposeLocalEdit(request, state, playheadMs));
      setError("");
    } catch (cause) {
      setProposal(null);
      setError(cause instanceof Error ? cause.message : "Could not preview this edit.");
    }
  };
  const apply = () => {
    if (!proposal || stale) return;
    try {
      onApply(proposal);
      setProposal(null);
      setRequest("");
      setError("");
    } catch (cause) {
      setProposal(null);
      setError(cause instanceof Error ? cause.message : "Could not apply this edit.");
    }
  };

  return <div className="render-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') ?? []).filter((item) => item.offsetParent !== null);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }} className="render-modal agent-panel" role="dialog" aria-modal="true" aria-labelledby="agent-title">
      <div className="render-header"><div><span className="eyebrow">KRIYA · AGENT WORKSPACE</span><h2 id="agent-title">Creative intelligence</h2></div><button className="icon-button" aria-label="Close agent" onClick={onClose}>×</button></div>
      <nav className="studio-tabs" aria-label="Agent mode"><button aria-pressed={view === "studio"} onClick={() => setView("studio")}>Assistant</button><button aria-pressed={view === "edit"} onClick={() => setView("edit")}>Edit preview</button></nav>
      {view === "studio" ? <AgentStudio key={state.project.id} state={state} playheadMs={playheadMs} onPreview={(input) => { setView("edit"); setRequest(input); try { setProposal(proposeLocalEdit(input, state, playheadMs)); setError(""); } catch (cause) { setProposal(null); setError(cause instanceof Error ? cause.message : "Could not preview."); } }} /> : <>
      <p>Select a clip, then ask for one edit. KRIYA checks the result before you approve it.</p>
      <label htmlFor="agent-request">EDIT REQUEST</label>
      <input id="agent-request" autoFocus value={request} onChange={(event) => { setRequest(event.target.value); setProposal(null); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") preview(); }} placeholder="Split clip at playhead" />
      <div className="agent-examples">Try: “duplicate selected clip” or “set selected clip speed to 2x”</div>
      {error && <div className="agent-error" role="alert">{error}</div>}
      {proposal && <div className="agent-preview">
        <strong>{proposal.summary}</strong>
        <span>Target: {proposal.target}</span>
        <span>{proposal.impact}</span>
        {stale && <span className="agent-error" role="alert">The timeline or selection changed. Preview the request again.</span>}
      </div>}
      <div className="render-footer">
        <button className="secondary-button" onClick={onClose}>CLOSE</button>
        <button className="secondary-button" onClick={preview} disabled={!request.trim()}>PREVIEW</button>
        <button className="primary-button" onClick={apply} disabled={!proposal || stale}>APPLY EDIT</button>
      </div>
      </>}
    </section>
  </div>;
}
