import type { EditingCommand, EditingOperation, StoredEditorState } from "../project/types";
import { createEditingCommand } from "../project/types";
import { applyEditingCommand } from "../timeline/commands";

export interface LocalEditProposal {
  command: EditingCommand;
  summary: string;
  impact: string;
  target: string;
  targetClipId: string;
}

export function proposeLocalEdit(input: string, state: StoredEditorState, playheadMs: number): LocalEditProposal {
  const request = input.trim().toLowerCase().replace(/[.!?]+$/, "");
  const selectedClipId = state.selectedClipId;
  if (!selectedClipId) throw new Error("Select a timeline clip first.");
  const selectedTrack = state.timeline.tracks.find((track) => track.clips.some((clip) => clip.id === selectedClipId));
  const selectedClip = selectedTrack?.clips.find((clip) => clip.id === selectedClipId);
  if (!selectedTrack || !selectedClip) throw new Error("The selected clip is no longer on the timeline.");

  let operation: EditingOperation;
  let summary: string;
  if (/^split (?:the )?(?:selected )?clip at (?:the )?playhead$/.test(request)) {
    operation = { op: "timeline.split", args: { clipId: selectedClipId, atMs: playheadMs } };
    summary = "Split the selected clip at the playhead";
  } else if (/^delete (?:the )?(?:selected )?clip$/.test(request)) {
    operation = { op: "timeline.delete", args: { clipId: selectedClipId } };
    summary = "Delete the selected clip without shifting other clips";
  } else if (/^duplicate (?:the )?(?:selected )?clip$/.test(request)) {
    operation = { op: "timeline.duplicate", args: { clipId: selectedClipId } };
    summary = "Duplicate the selected clip after its current position";
  } else {
    const speed = request.match(/^set (?:the )?(?:selected )?clip speed to (\d+(?:\.\d+)?)x?$/);
    if (!speed) throw new Error("Supported requests: split clip at playhead, delete selected clip, duplicate selected clip, or set selected clip speed to 2x.");
    operation = { op: "timeline.setSpeed", args: { clipId: selectedClipId, speed: Number(speed[1]) } };
    summary = `Set the selected clip speed to ${speed[1]}x`;
  }

  const command = createEditingCommand(state.timeline, operation);
  const preview = applyEditingCommand(state.timeline, operation, state.assets, {
    commandId: command.commandId,
    projectId: command.projectId,
    timelineVersion: command.timelineVersion,
  });
  const beforeCount = state.timeline.tracks.reduce((count, track) => count + track.clips.length, 0);
  const afterCount = preview.timeline.tracks.reduce((count, track) => count + track.clips.length, 0);
  const target = state.assets.find((asset) => asset.id === selectedClip.assetId)?.fileName ?? "Selected clip";
  return {
    command,
    summary,
    target,
    targetClipId: selectedClipId,
    impact: `Timeline clips: ${beforeCount} → ${afterCount}. Duration: ${Math.round(state.timeline.durationMs / 1000)}s → ${Math.round(preview.timeline.durationMs / 1000)}s. New version: ${preview.timeline.version}.`,
  };
}
