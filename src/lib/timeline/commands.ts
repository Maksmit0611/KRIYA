import type { Asset, EditingCommand, EditingOperation, Timeline, TimelineClip } from "../project/types";
import { assertCommand, assertTimeline } from "../project/validation";

type CommandEnvelope = { commandId: string; projectId: string; timelineVersion: number };

function findClip(timeline: Timeline, clipId: string): { trackIndex: number; clipIndex: number; clip: TimelineClip } {
  for (let trackIndex = 0; trackIndex < timeline.tracks.length; trackIndex += 1) {
    const clipIndex = timeline.tracks[trackIndex].clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex >= 0) return { trackIndex, clipIndex, clip: timeline.tracks[trackIndex].clips[clipIndex] };
  }
  throw new Error(`Clip not found: ${clipId}`);
}

function findEditableClip(timeline: Timeline, clipId: string): { trackIndex: number; clipIndex: number; clip: TimelineClip } {
  const found = findClip(timeline, clipId);
  if (timeline.tracks[found.trackIndex].locked) throw new Error("Cannot edit a locked track.");
  return found;
}

function nextDuration(timeline: Timeline): number {
  return Math.max(0, ...timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.timelineStartMs + clip.durationMs)));
}

function copy(timeline: Timeline): Timeline {
  return structuredClone(timeline);
}

export function applyEditingCommand(
  current: Timeline,
  operation: EditingOperation,
  assets: Asset[],
  envelope: CommandEnvelope = { commandId: crypto.randomUUID(), projectId: current.projectId, timelineVersion: current.version },
): { timeline: Timeline; affectedObjectIds: string[] } {
  const command = { ...operation, ...envelope } as EditingCommand;
  assertCommand(command);
  assertTimeline(current);
  if (envelope.projectId !== current.projectId) throw new Error("Command projectId does not match the active project.");
  if (envelope.timelineVersion !== current.version) throw new Error(`Stale timeline version ${envelope.timelineVersion}; current version is ${current.version}.`);
  const timeline = copy(current);
  let affectedObjectIds: string[] = [];

  switch (command.op) {
    case "timeline.insert": {
      const { trackId, assetId, atMs } = command.args;
      const track = timeline.tracks.find((candidate) => candidate.id === trackId);
      const asset = assets.find((candidate) => candidate.id === assetId);
      if (!track || !asset) throw new Error("Insert requires an existing track and asset.");
      if (asset.projectId !== timeline.projectId) throw new Error("Cannot insert an asset from a different project.");
      const expectedKind = asset.kind === "audio" || asset.kind === "music" || asset.kind === "sound-effect" || asset.kind === "voice" ? "audio" : asset.kind === "graphic" ? "graphics" : asset.kind === "subtitle" ? "captions" : "video";
      if (track.kind !== expectedKind) throw new Error(`A ${asset.kind} asset cannot be inserted on a ${track.kind} track.`);
      if (track.locked) throw new Error("Cannot edit a locked track.");
      const durationMs = asset.durationMs ?? (asset.kind.includes("image") || asset.mimeType.startsWith("image/") ? 5000 : null);
      if (!durationMs || durationMs <= 0) throw new Error("Asset duration is not available yet.");
      const clip: TimelineClip = {
        id: crypto.randomUUID(), assetId, timelineStartMs: Math.max(0, atMs), sourceStartMs: 0,
        sourceDurationMs: durationMs, durationMs, speed: 1, opacity: 1, gain: 1, muted: false,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, effects: [], keyframes: [],
      };
      track.clips.push(clip);
      track.clips.sort((a, b) => a.timelineStartMs - b.timelineStartMs);
      affectedObjectIds = [track.id, clip.id];
      break;
    }
    case "timeline.split": {
      const { clip, trackIndex, clipIndex } = findEditableClip(timeline, command.args.clipId);
      const splitDuration = command.args.atMs - clip.timelineStartMs;
      if (splitDuration <= 0 || splitDuration >= clip.durationMs) throw new Error("Split point must be inside the clip.");
      const right: TimelineClip = {
        ...structuredClone(clip), id: crypto.randomUUID(), timelineStartMs: command.args.atMs,
        sourceStartMs: clip.sourceStartMs + splitDuration * clip.speed,
        sourceDurationMs: clip.sourceDurationMs - splitDuration * clip.speed,
        durationMs: clip.durationMs - splitDuration,
      };
      const left = timeline.tracks[trackIndex].clips[clipIndex];
      left.durationMs = splitDuration;
      left.sourceDurationMs = splitDuration * left.speed;
      timeline.tracks[trackIndex].clips.splice(clipIndex + 1, 0, right);
      affectedObjectIds = [clip.id, right.id];
      break;
    }
    case "timeline.trim": {
      const { clip } = findEditableClip(timeline, command.args.clipId);
      if (command.args.edge === "end") {
        const duration = command.args.toMs - clip.timelineStartMs;
        if (duration <= 0 || duration * clip.speed > clip.sourceDurationMs) throw new Error("Trim exceeds available source media.");
        clip.durationMs = duration;
        clip.sourceDurationMs = duration * clip.speed;
      } else {
        const delta = command.args.toMs - clip.timelineStartMs;
        const remaining = clip.durationMs - delta;
        if (remaining <= 0 || delta < 0 || clip.sourceStartMs + delta * clip.speed + remaining * clip.speed > clip.sourceStartMs + clip.sourceDurationMs) throw new Error("Trim exceeds available source media.");
        clip.timelineStartMs = command.args.toMs;
        clip.sourceStartMs += delta * clip.speed;
        clip.sourceDurationMs = remaining * clip.speed;
        clip.durationMs = remaining;
      }
      affectedObjectIds = [clip.id];
      break;
    }
    case "timeline.move": {
      const { clip, trackIndex } = findEditableClip(timeline, command.args.clipId);
      const target = timeline.tracks.find((candidate) => candidate.id === command.args.trackId);
      if (!target || target.locked) throw new Error("Move requires an unlocked destination and source track.");
      if (target.kind !== timeline.tracks[trackIndex].kind) throw new Error("A clip can only move to a track of the same kind.");
      if (!target.clips.some((candidate) => candidate.id === clip.id)) {
        timeline.tracks[trackIndex].clips = timeline.tracks[trackIndex].clips.filter((candidate) => candidate.id !== clip.id);
        target.clips.push(clip);
      }
      clip.timelineStartMs = Math.max(0, command.args.toMs);
      target.clips.sort((a, b) => a.timelineStartMs - b.timelineStartMs);
      affectedObjectIds = [timeline.tracks[trackIndex].id, target.id, clip.id];
      break;
    }
    case "timeline.rippleDelete": {
      const { startMs, endMs, trackIds, preserveSync } = command.args;
      if (endMs <= startMs) throw new Error("Ripple delete end must be after its start.");
      const delta = endMs - startMs;
      const targets = preserveSync ? timeline.tracks : timeline.tracks.filter((track) => trackIds.includes(track.id));
      if (targets.some((track) => track.locked)) throw new Error("Ripple delete includes a locked track.");
      for (const track of targets) {
        const remaining: TimelineClip[] = [];
        for (const clip of track.clips) {
          const clipEnd = clip.timelineStartMs + clip.durationMs;
          if (clip.timelineStartMs >= endMs) {
            clip.timelineStartMs -= delta;
            remaining.push(clip);
          } else if (clipEnd > startMs && clip.timelineStartMs < endMs) {
            const cutStart = Math.max(0, startMs - clip.timelineStartMs);
            const cutEnd = Math.min(clip.durationMs, endMs - clip.timelineStartMs);
            const keptBefore = cutStart > 0;
            const keptAfter = cutEnd < clip.durationMs;
            if (keptBefore && keptAfter) {
              const right = structuredClone(clip);
              right.id = crypto.randomUUID();
              right.timelineStartMs = startMs;
              right.sourceStartMs += cutEnd * right.speed;
              right.sourceDurationMs = (clip.durationMs - cutEnd) * right.speed;
              right.durationMs = clip.durationMs - cutEnd;
              clip.durationMs = cutStart;
              clip.sourceDurationMs = cutStart * clip.speed;
              remaining.push(clip, right);
            } else if (keptBefore) {
              clip.durationMs = cutStart;
              clip.sourceDurationMs = cutStart * clip.speed;
              remaining.push(clip);
            } else if (keptAfter) {
              const removed = cutEnd;
              clip.timelineStartMs = startMs;
              clip.sourceStartMs += removed * clip.speed;
              clip.durationMs -= removed;
              clip.sourceDurationMs = clip.durationMs * clip.speed;
              remaining.push(clip);
            }
          } else remaining.push(clip);
        }
        track.clips = remaining;
      }
      affectedObjectIds = targets.map((track) => track.id);
      break;
    }
    case "timeline.duplicate": {
      const { clip, trackIndex } = findEditableClip(timeline, command.args.clipId);
      const duplicate = structuredClone(clip);
      duplicate.id = crypto.randomUUID();
      duplicate.timelineStartMs = command.args.toMs ?? clip.timelineStartMs + clip.durationMs;
      timeline.tracks[trackIndex].clips.push(duplicate);
      timeline.tracks[trackIndex].clips.sort((a, b) => a.timelineStartMs - b.timelineStartMs);
      affectedObjectIds = [clip.id, duplicate.id];
      break;
    }
    case "timeline.delete": {
      const { clip, trackIndex } = findEditableClip(timeline, command.args.clipId);
      timeline.tracks[trackIndex].clips.splice(timeline.tracks[trackIndex].clips.findIndex((candidate) => candidate.id === clip.id), 1);
      affectedObjectIds = [clip.id, timeline.tracks[trackIndex].id];
      break;
    }
    case "timeline.setSpeed": {
      const { clip } = findEditableClip(timeline, command.args.clipId);
      if (command.args.speed <= 0 || command.args.speed > 16) throw new Error("Speed must be between 0 and 16.");
      clip.speed = command.args.speed;
      clip.durationMs = clip.sourceDurationMs / clip.speed;
      affectedObjectIds = [clip.id];
      break;
    }
    case "timeline.transform": {
      const { clip } = findEditableClip(timeline, command.args.clipId);
      const next = { ...clip.transform, ...command.args.transform };
      if (next.scaleX <= 0 || next.scaleY <= 0) throw new Error("Transform scale must be positive.");
      clip.transform = next;
      affectedObjectIds = [clip.id];
      break;
    }
    case "timeline.setOpacity": {
      const { clip } = findEditableClip(timeline, command.args.clipId);
      clip.opacity = command.args.opacity;
      affectedObjectIds = [clip.id];
      break;
    }
    case "audio.setGain": {
      const { clip } = findEditableClip(timeline, command.args.clipId);
      if (command.args.gain < 0 || command.args.gain > 4) throw new Error("Gain must be between 0 and 4.");
      clip.gain = command.args.gain;
      if (command.args.muted !== undefined) clip.muted = command.args.muted;
      affectedObjectIds = [clip.id];
      break;
    }
  }

  timeline.version += 1;
  timeline.durationMs = nextDuration(timeline);
  assertTimeline(timeline);
  return { timeline, affectedObjectIds };
}
