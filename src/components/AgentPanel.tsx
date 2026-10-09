import { useState } from "react";
import type { StoredEditorState } from "../lib/project/types";
import { proposeLocalEdit } from "../lib/agent/local";
import type { LocalEditProposal } from "../lib/agent/local";
import "./AgentPanel.css";

interface AgentPanelProps {
  state: StoredEditorState;
  playheadMs: number;
  onApply: (proposal: LocalEditProposal) => void;
  onClose: () => void;
}

export function AgentPanel({ state, playheadMs, onApply, onClose }: AgentPanelProps) {
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
    <section className="render-modal agent-panel" role="dialog" aria-modal="true" aria-labelledby="agent-title">
      <div className="render-header"><div><span className="eyebrow">LOCAL AGENT · OFFLINE</span><h2 id="agent-title">Preview an edit</h2></div><button className="icon-button" aria-label="Close agent" onClick={onClose}>×</button></div>
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
    </section>
  </div>;
}
