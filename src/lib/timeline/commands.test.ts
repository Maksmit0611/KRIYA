import { describe, expect, test } from "bun:test";
import type { Asset, EditingOperation, Timeline, TimelineClip } from "../project/types";
import { applyEditingCommand } from "./commands";
import { assertCommand, assertStoredEditorState } from "../project/validation";
import { createInitialState } from "../project/initial";
import { getBrowserPreviewDuration } from "../media/previewDuration";

const clip = (id: string, start = 0, duration = 10000): TimelineClip => ({
  id, assetId: "asset-1", timelineStartMs: start, sourceStartMs: 0, sourceDurationMs: duration,
  durationMs: duration, speed: 1, opacity: 1, gain: 1, muted: false,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, effects: [], keyframes: [],
});
const track = (id: string, kind: Timeline["tracks"][number]["kind"] = "video", clips: TimelineClip[] = []) => ({
  id, kind, name: id, locked: false, visible: true, muted: false, solo: false, height: 56, clips,
});
const timeline = (): Timeline => ({ schemaVersion: "1.0.0", id: "timeline-1", projectId: "project-1", version: 3, timebase: { fps: 30 }, durationMs: 30000, tracks: [track("v1", "video", [clip("clip-1", 0, 10000), clip("clip-2", 15000, 5000)]), track("a1", "audio", [clip("audio-1", 0, 20000)]), track("cc", "captions", [clip("caption-1", 0, 10000)])] });
const assets: Asset[] = [{ id: "asset-1", workspaceId: "workspace-1", projectId: "project-1", kind: "video", source: "upload", storageKey: "original-1", fileName: "source.mp4", mimeType: "video/mp4", fileSize: 1000, durationMs: 30000, width: 1920, height: 1080, fps: 30, hasAudio: true, createdAt: new Date().toISOString(), metadata: {}, provenance: { source: "upload", createdAt: new Date().toISOString() }, rightsRecordId: null }];
const apply = (current: Timeline, operation: EditingOperation) => applyEditingCommand(current, operation, assets).timeline;

describe("deterministic editing commands", () => {
  test("splits a clip into source-contiguous halves and preserves its input", () => {
    const source = timeline();
    const result = apply(source, { op: "timeline.split", args: { clipId: "clip-1", atMs: 4000 } });
    expect(source.tracks[0].clips[0].durationMs).toBe(10000);
    expect(result.tracks[0].clips).toHaveLength(3);
    expect(result.tracks[0].clips[0].durationMs).toBe(4000);
    expect(result.tracks[0].clips[1].timelineStartMs).toBe(4000);
    expect(result.tracks[0].clips[1].sourceStartMs).toBe(4000);
    expect(result.version).toBe(4);
  });

  test("ripple-deletes the selected range across synchronized tracks", () => {
    const result = apply(timeline(), { op: "timeline.rippleDelete", args: { trackIds: ["v1"], startMs: 4000, endMs: 7000, preserveSync: true } });
    expect(result.tracks[0].clips[0].durationMs).toBe(4000);
    expect(result.tracks[0].clips[1].timelineStartMs).toBe(4000);
    expect(result.tracks[0].clips[1].durationMs).toBe(3000);
    expect(result.tracks[0].clips[2].timelineStartMs).toBe(12000);
    expect(result.tracks[1].clips[0].durationMs).toBe(4000);
    expect(result.tracks[1].clips[1].timelineStartMs).toBe(4000);
    expect(result.tracks[1].clips[1].durationMs).toBe(13000);
    expect(result.tracks[2].clips).toHaveLength(2);
    expect(result.tracks[2].clips[0].durationMs).toBe(4000);
    expect(result.tracks[2].clips[1].timelineStartMs).toBe(4000);
    expect(result.tracks[2].clips[1].durationMs).toBe(3000);
  });

  test("rejects stale timeline versions and locked-track edits", () => {
    const source = timeline();
    expect(() => applyEditingCommand(source, { op: "timeline.delete", args: { clipId: "clip-1" } }, assets, { commandId: "cmd-1", projectId: source.projectId, timelineVersion: 2 })).toThrow(/Stale timeline version/);
    const locked = { ...source, tracks: source.tracks.map((item) => item.id === "v1" ? { ...item, locked: true } : item) };
    expect(() => apply(locked, { op: "timeline.delete", args: { clipId: "clip-1" } })).toThrow(/locked/);
    expect(() => apply(locked, { op: "timeline.setOpacity", args: { clipId: "clip-1", opacity: 0.5 } })).toThrow(/locked/);
  });

  test("prevents placing incompatible or foreign-project assets on a track", () => {
    expect(() => apply(timeline(), { op: "timeline.insert", args: { trackId: "a1", assetId: "asset-1", atMs: 0 } })).toThrow(/cannot be inserted on a audio track/);
    const foreign = { ...assets[0], projectId: "another-project" };
    expect(() => applyEditingCommand(timeline(), { op: "timeline.insert", args: { trackId: "v1", assetId: foreign.id, atMs: 0 } }, [foreign])).toThrow(/different project/);
  });

  test("trims the start edge while retaining the original media source", () => {
    const result = apply(timeline(), { op: "timeline.trim", args: { clipId: "clip-1", edge: "start", toMs: 2000 } });
    expect(result.tracks[0].clips[0]).toMatchObject({ timelineStartMs: 2000, sourceStartMs: 2000, durationMs: 8000, sourceDurationMs: 8000 });
    expect(assets[0].storageKey).toBe("original-1");
  });

  test("rejects agent-shaped commands with invalid operation arguments", () => {
    expect(() => applyEditingCommand(timeline(), { op: "timeline.split", args: { clipId: "clip-1", atMs: "four seconds" } } as unknown as EditingOperation, assets)).toThrow(/validation failed/);
    expect(() => assertCommand({ commandId: "cmd", projectId: "project-1", timelineVersion: 3, op: "timeline.split", args: { clipId: "clip-1", speed: 2 } })).toThrow(/validation failed/);
  });

  test("adjusts speed, opacity, and gain through validated operations", () => {
    const speed = apply(timeline(), { op: "timeline.setSpeed", args: { clipId: "clip-1", speed: 2 } });
    expect(speed.tracks[0].clips[0]).toMatchObject({ speed: 2, durationMs: 5000 });
    const opacity = apply(speed, { op: "timeline.setOpacity", args: { clipId: "clip-1", opacity: 0.4 } });
    expect(opacity.tracks[0].clips[0].opacity).toBe(0.4);
    const gain = apply(opacity, { op: "audio.setGain", args: { clipId: "audio-1", gain: 1.5, muted: true } });
    expect(gain.tracks[1].clips[0]).toMatchObject({ gain: 1.5, muted: true });
  });

  test("validates persisted project references before reloading local state", () => {
    const state = createInitialState();
    expect(() => assertStoredEditorState(state)).not.toThrow();
    const invalid = { ...state, timeline: { ...state.timeline, projectId: "other-project" } };
    expect(() => assertStoredEditorState(invalid)).toThrow(/references do not match/);
  });

  test("rejects edits that target any locked track, including synchronized captions", () => {
    const lockedCaptions = { ...timeline(), tracks: timeline().tracks.map((item) => item.id === "cc" ? { ...item, locked: true } : item) };
    expect(() => apply(lockedCaptions, { op: "timeline.rippleDelete", args: { trackIds: ["v1"], startMs: 1000, endMs: 2000, preserveSync: true } })).toThrow(/locked/);
  });

  test("browser preview duration follows visible picture clips only", () => {
    const source = timeline();
    const previewAssets: Asset[] = [...assets, { ...assets[0], id: "audio-asset", kind: "audio", mimeType: "audio/mpeg", durationMs: 90000 }];
    source.tracks[1].clips = [{ ...clip("audio-only", 0, 90000), assetId: "audio-asset" }];
    expect(getBrowserPreviewDuration(source, previewAssets)).toBe(20000);
    source.tracks[0].visible = false;
    expect(getBrowserPreviewDuration(source, previewAssets)).toBe(0);
  });
});
