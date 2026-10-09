import { describe, expect, test } from "bun:test";
import { createInitialState } from "../project/initial";
import type { Asset, StoredEditorState, TimelineClip } from "../project/types";
import { applyEditingCommand } from "../timeline/commands";
import { proposeLocalEdit } from "./local";

function editorWithClip(): StoredEditorState {
  const state = createInitialState();
  const asset: Asset = {
    id: "asset-1", projectId: state.project.id, workspaceId: state.project.workspaceId,
    kind: "video", source: "upload", storageKey: "original-1", fileName: "source.mp4",
    mimeType: "video/mp4", fileSize: 1000, durationMs: 10000, width: 1920, height: 1080,
    fps: 30, hasAudio: true, createdAt: new Date().toISOString(), metadata: {},
    provenance: { source: "upload", createdAt: new Date().toISOString() }, rightsRecordId: null,
  };
  const clip: TimelineClip = {
    id: "clip-1", assetId: asset.id, timelineStartMs: 0, sourceStartMs: 0,
    sourceDurationMs: 10000, durationMs: 10000, speed: 1, opacity: 1, gain: 1,
    muted: false, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [], keyframes: [],
  };
  state.assets = [asset];
  state.timeline.tracks[0].clips = [clip];
  state.timeline.durationMs = 10000;
  state.selectedClipId = clip.id;
  return state;
}

describe("local edit proposals", () => {
  test("previews a split without mutating the project and accepts the same version", () => {
    const state = editorWithClip();
    const proposal = proposeLocalEdit("split clip at playhead", state, 4000);
    expect(proposal.summary).toContain("Split");
    expect(proposal.impact).toContain("1 → 2");
    expect(state.timeline.tracks[0].clips).toHaveLength(1);
    const result = applyEditingCommand(state.timeline, proposal.command, state.assets, proposal.command);
    expect(result.timeline.tracks[0].clips).toHaveLength(2);
  });

  test("refuses stale approval and invalid or ambiguous requests", () => {
    const state = editorWithClip();
    const proposal = proposeLocalEdit("delete selected clip", state, 4000);
    state.timeline.version += 1;
    expect(() => applyEditingCommand(state.timeline, proposal.command, state.assets, proposal.command)).toThrow(/Stale timeline version/);
    expect(() => proposeLocalEdit("delete all clips", state, 4000)).toThrow(/Supported requests/);
    expect(() => proposeLocalEdit("split clip at playhead", state, 0)).toThrow(/Split point/);
  });

  test("refuses edits on locked tracks", () => {
    const state = editorWithClip();
    state.timeline.tracks[0].locked = true;
    expect(() => proposeLocalEdit("duplicate selected clip", state, 4000)).toThrow(/locked/);
  });
});
