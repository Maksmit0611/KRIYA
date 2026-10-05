export type AssetKind =
  | "video"
  | "image"
  | "audio"
  | "generated-video"
  | "generated-image"
  | "voice"
  | "music"
  | "sound-effect"
  | "graphic"
  | "font"
  | "subtitle"
  | "proxy"
  | "render";

export type TrackKind = "video" | "audio" | "graphics" | "captions";

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
  colorSpace: "rec709";
}

export interface Project {
  schemaVersion: "1.0.0";
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  timelineId: string;
  activeVersion: number;
}

export interface AssetProvenance {
  source: "upload" | "generated" | "derived";
  provider?: string;
  model?: string;
  prompt?: string;
  parentAssetIds?: string[];
  createdAt: string;
}

export interface Asset {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: AssetKind;
  source: "upload" | "generated" | "derived";
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean | null;
  createdAt: string;
  metadata: Record<string, unknown>;
  provenance: AssetProvenance;
  rightsRecordId: string | null;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  timelineStartMs: number;
  sourceStartMs: number;
  sourceDurationMs: number;
  durationMs: number;
  speed: number;
  opacity: number;
  gain: number;
  muted: boolean;
  transform: Transform;
  effects: unknown[];
  keyframes: unknown[];
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  locked: boolean;
  visible: boolean;
  muted: boolean;
  solo: boolean;
  height: number;
  clips: TimelineClip[];
}

export interface Timeline {
  schemaVersion: "1.0.0";
  id: string;
  projectId: string;
  version: number;
  timebase: { fps: number };
  durationMs: number;
  tracks: Track[];
}

export type EditingOperation =
  | { op: "timeline.insert"; args: { trackId: string; assetId: string; atMs: number } }
  | { op: "timeline.split"; args: { clipId: string; atMs: number } }
  | { op: "timeline.trim"; args: { clipId: string; edge: "start" | "end"; toMs: number } }
  | { op: "timeline.move"; args: { clipId: string; trackId: string; toMs: number } }
  | { op: "timeline.rippleDelete"; args: { trackIds: string[]; startMs: number; endMs: number; preserveSync: boolean } }
  | { op: "timeline.duplicate"; args: { clipId: string; toMs?: number } }
  | { op: "timeline.delete"; args: { clipId: string } }
  | { op: "timeline.setSpeed"; args: { clipId: string; speed: number } }
  | { op: "timeline.transform"; args: { clipId: string; transform: Partial<Transform> } }
  | { op: "timeline.setOpacity"; args: { clipId: string; opacity: number } }
  | { op: "audio.setGain"; args: { clipId: string; gain: number; muted?: boolean } };

export type EditingCommand = EditingOperation & {
  commandId: string;
  projectId: string;
  timelineVersion: number;
};

export function createEditingCommand(timeline: Timeline, operation: EditingOperation): EditingCommand {
  return { ...operation, commandId: crypto.randomUUID(), projectId: timeline.projectId, timelineVersion: timeline.version } as EditingCommand;
}

export interface ProjectVersion {
  version: number;
  name: string;
  createdAt: string;
  timeline: Timeline;
  commandId: string;
  label: string;
}

export type AuditOperation = EditingCommand["op"] | "track.locked" | "track.visible" | "track.muted" | "track.solo" | "timeline.trackAdd" | "version.restore" | "timeline.undo" | "timeline.redo" | "project.settings" | "project.rename";

export interface AuditEvent {
  id: string;
  commandId: string;
  op: AuditOperation;
  actor: "local-user";
  timestamp: string;
  beforeVersion: number;
  afterVersion: number;
  affectedObjectIds: string[];
}

export interface StoredEditorState {
  project: Project;
  timeline: Timeline;
  assets: Asset[];
  versions: ProjectVersion[];
  auditLog: AuditEvent[];
  selectedClipId: string | null;
  selectedTrackId: string | null;
}
