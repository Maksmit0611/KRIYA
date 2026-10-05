import type { Asset, Project, StoredEditorState, Timeline } from "./types";

export function createInitialState(): StoredEditorState {
  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const timelineId = crypto.randomUUID();
  const project: Project = {
    schemaVersion: "1.0.0", id: projectId, workspaceId: "workspace_local", name: "Untitled film",
    createdAt: now, updatedAt: now, settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000, colorSpace: "rec709" },
    timelineId, activeVersion: 0,
  };
  const track = (kind: Timeline["tracks"][number]["kind"], name: string, height: number) => ({
    id: crypto.randomUUID(), kind, name, locked: false, visible: true, muted: false, solo: false, height, clips: [],
  });
  const timeline: Timeline = {
    schemaVersion: "1.0.0", id: timelineId, projectId, version: 0, timebase: { fps: 30 }, durationMs: 0,
    tracks: [track("video", "V1 · Main", 74), track("video", "V2 · Overlay", 64), track("graphics", "G1 · Titles", 52), track("audio", "A1 · Production", 56), track("audio", "A2 · Music", 56), track("captions", "CC · Subtitles", 44)],
  };
  const assets: Asset[] = [];
  return { project, timeline, assets, versions: [], auditLog: [], selectedClipId: null, selectedTrackId: timeline.tracks[0].id };
}
