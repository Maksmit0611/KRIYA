import Ajv2020 from "ajv/dist/2020.js";
import projectSchema from "../../../schemas/project.schema.json";
import timelineSchema from "../../../schemas/timeline.schema.json";
import assetSchema from "../../../schemas/asset.schema.json";
import commandSchema from "../../../schemas/edit-command.schema.json";
import type { Asset, EditingCommand, Project, StoredEditorState, Timeline } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { "date-time": true } });
const validateProject = ajv.compile(projectSchema);
const validateTimeline = ajv.compile(timelineSchema);
const validateAsset = ajv.compile(assetSchema);
const validateCommand = ajv.compile(commandSchema);

function failure(name: string, errors: typeof validateProject.errors): never {
  const details = errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
  throw new Error(`${name} validation failed${details ? `: ${details}` : "."}`);
}

export function assertProject(value: Project): void {
  if (!validateProject(value)) failure("Project", validateProject.errors);
}

export function assertAsset(value: unknown): asserts value is Asset {
  if (!validateAsset(value)) failure("Asset", validateAsset.errors);
  const asset = value as unknown as Asset;
  if (asset.source !== asset.provenance.source) throw new Error("Asset source and provenance source must match.");
}

export function assertTimeline(value: Timeline): void {
  if (!validateTimeline(value)) failure("Timeline", validateTimeline.errors);
  const trackIds = new Set<string>();
  const clipIds = new Set<string>();
  for (const track of value.tracks) {
    if (trackIds.has(track.id)) throw new Error(`Timeline has duplicate track id: ${track.id}`);
    trackIds.add(track.id);
    for (const clip of track.clips) {
      if (clipIds.has(clip.id)) throw new Error(`Timeline has duplicate clip id: ${clip.id}`);
      clipIds.add(clip.id);
    }
  }
}

export function assertCommand(value: unknown): asserts value is EditingCommand {
  if (!validateCommand(value)) failure("Editing command", validateCommand.errors);
}

export function assertStoredEditorState(value: unknown): asserts value is StoredEditorState {
  if (!value || typeof value !== "object") throw new Error("Saved editor state must be an object.");
  const state = value as Partial<StoredEditorState>;
  assertProject(state.project as Project);
  assertTimeline(state.timeline as Timeline);
  if (state.project!.id !== state.timeline!.projectId || state.project!.timelineId !== state.timeline!.id) {
    throw new Error("Saved project and timeline references do not match.");
  }
  if (state.project!.activeVersion !== state.timeline!.version) throw new Error("Saved project version does not match its active timeline.");
  if (!Array.isArray(state.assets) || !Array.isArray(state.versions) || !Array.isArray(state.auditLog)) {
    throw new Error("Saved editor state is missing its asset, version, or audit collections.");
  }
  const assetIds = new Set<string>();
  for (const asset of state.assets) {
    assertAsset(asset);
    if (assetIds.has(asset.id)) throw new Error(`Saved project has duplicate asset id: ${asset.id}`);
    if (asset.projectId !== state.project!.id || asset.workspaceId !== state.project!.workspaceId) {
      throw new Error(`Asset ${asset.id} belongs to a different project or workspace.`);
    }
    assetIds.add(asset.id);
  }
  for (const track of state.timeline!.tracks) {
    for (const clip of track.clips) {
      if (!assetIds.has(clip.assetId)) throw new Error(`Clip ${clip.id} references missing asset ${clip.assetId}.`);
    }
  }
  for (const version of state.versions) {
    assertTimeline(version.timeline);
    if (version.timeline.version !== version.version || version.timeline.projectId !== state.project!.id) {
      throw new Error(`Saved version ${version.version} has an inconsistent timeline snapshot.`);
    }
  }
}
