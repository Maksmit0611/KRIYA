import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset, EditingCommand, ProjectVersion, StoredEditorState, Timeline } from "../project/types";
import { createInitialState } from "../project/initial";
import { loadEditorState, saveEditorState } from "../project/storage";
import { assertStoredEditorState } from "../project/validation";
import { applyEditingCommand } from "../timeline/commands";

export function useEditor() {
  const [state, setState] = useState<StoredEditorState>(() => createInitialState());
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const stateRef = useRef(state);
  const saveSequence = useRef(0);
  const history = useRef<Timeline[]>([]);
  const redoHistory = useRef<Timeline[]>([]);
  stateRef.current = state;

  useEffect(() => {
    let active = true;
    loadEditorState().then((stored) => {
      if (!active || !stored) return;
      try {
        assertStoredEditorState(stored);
        stateRef.current = stored;
        setState(stored);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Saved project data is invalid.";
        console.error("Saved KRIYA project could not be loaded:", error);
        setStorageWarning(`Saved data was not replaced: ${message}`);
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Local browser storage is unavailable.";
      console.error("KRIYA storage unavailable:", error);
      if (active) setStorageWarning(`Local storage unavailable: ${message}`);
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || storageWarning) return;
    const sequence = ++saveSequence.current;
    setSaved(false);
    const timer = window.setTimeout(() => {
      saveEditorState(state).then(() => {
        if (sequence === saveSequence.current) setSaved(true);
      }).catch((error: unknown) => {
        console.error("Autosave failed:", error);
        if (sequence === saveSequence.current) setStorageWarning("Local storage could not save this project. Export the project manifest and keep your original media backed up.");
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [ready, state, storageWarning]);

  const update = useCallback((updater: (current: StoredEditorState) => StoredEditorState) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  const dispatch = useCallback((command: EditingCommand) => {
    const current = stateRef.current;
    const { timeline, affectedObjectIds } = applyEditingCommand(current.timeline, command, current.assets);
    const now = new Date().toISOString();
    const version = timeline.version;
    history.current.push(current.timeline);
    if (history.current.length > 120) history.current.shift();
    redoHistory.current = [];
    const snapshot: ProjectVersion = { version, name: `Version ${version}`, createdAt: now, timeline: structuredClone(timeline), commandId: crypto.randomUUID(), label: command.op };
    update((latest) => ({
      ...latest,
      project: { ...latest.project, activeVersion: version, updatedAt: now },
      timeline,
      versions: [...latest.versions, snapshot],
      auditLog: [...latest.auditLog, { id: crypto.randomUUID(), commandId: snapshot.commandId, op: command.op, actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: version, affectedObjectIds }],
    }));
    return timeline;
  }, [update]);

  const undo = useCallback(() => {
    const current = stateRef.current;
    const previous = history.current.pop();
    if (!previous) return;
    redoHistory.current.push(current.timeline);
    const timeline = { ...previous, version: current.timeline.version + 1 };
    const now = new Date().toISOString();
    const commandId = crypto.randomUUID();
    update((latest) => ({ ...latest, timeline, project: { ...latest.project, activeVersion: timeline.version, updatedAt: now }, versions: [...latest.versions, { version: timeline.version, name: `Undo · Version ${timeline.version}`, createdAt: now, timeline: structuredClone(timeline), commandId, label: "timeline.undo" }], auditLog: [...latest.auditLog, { id: crypto.randomUUID(), commandId, op: "timeline.undo", actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: timeline.version, affectedObjectIds: [current.timeline.id] }] }));
  }, [update]);

  const redo = useCallback(() => {
    const current = stateRef.current;
    const next = redoHistory.current.pop();
    if (!next) return;
    history.current.push(current.timeline);
    const timeline = { ...next, version: current.timeline.version + 1 };
    const now = new Date().toISOString();
    const commandId = crypto.randomUUID();
    update((latest) => ({ ...latest, timeline, project: { ...latest.project, activeVersion: timeline.version, updatedAt: now }, versions: [...latest.versions, { version: timeline.version, name: `Redo · Version ${timeline.version}`, createdAt: now, timeline: structuredClone(timeline), commandId, label: "timeline.redo" }], auditLog: [...latest.auditLog, { id: crypto.randomUUID(), commandId, op: "timeline.redo", actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: timeline.version, affectedObjectIds: [current.timeline.id] }] }));
  }, [update]);

  const replaceTimeline = useCallback((timeline: Timeline) => {
    history.current.push(stateRef.current.timeline);
    redoHistory.current = [];
    update((current) => ({ ...current, timeline: { ...timeline, version: current.timeline.version + 1 }, project: { ...current.project, activeVersion: current.timeline.version + 1 } }));
  }, [update]);

  const addAssets = useCallback((assets: Asset[]) => update((current) => ({ ...current, assets: [...current.assets, ...assets] })), [update]);
  const setProjectName = useCallback((name: string) => update((current) => {
    const now = new Date().toISOString();
    const commandId = crypto.randomUUID();
    return { ...current, project: { ...current.project, name, updatedAt: now }, auditLog: [...current.auditLog, { id: crypto.randomUUID(), commandId, op: "project.rename", actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: current.timeline.version, affectedObjectIds: [current.project.id] }] };
  }), [update]);
  const mutate = useCallback((updater: (current: StoredEditorState) => StoredEditorState) => update(updater), [update]);
  const addTrack = useCallback((kind: Timeline["tracks"][number]["kind"]) => update((current) => {
    const ordinal = current.timeline.tracks.filter((track) => track.kind === kind).length + 1;
    const now = new Date().toISOString();
    const track = { id: crypto.randomUUID(), kind, name: `${kind === "audio" ? "A" : kind === "video" ? "V" : kind === "graphics" ? "G" : "CC"}${ordinal} · ${kind === "video" ? "Video" : kind === "audio" ? "Audio" : kind === "graphics" ? "Graphics" : "Subtitles"}`, locked: false, visible: true, muted: false, solo: false, height: 56, clips: [] };
    const timeline = { ...current.timeline, version: current.timeline.version + 1, tracks: [...current.timeline.tracks, track] };
    const commandId = crypto.randomUUID();
    return { ...current, timeline, project: { ...current.project, activeVersion: timeline.version, updatedAt: now }, versions: [...current.versions, { version: timeline.version, name: `Version ${timeline.version}`, createdAt: now, timeline: structuredClone(timeline), commandId, label: "track.add" }], auditLog: [...current.auditLog, { id: crypto.randomUUID(), commandId, op: "timeline.trackAdd", actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: timeline.version, affectedObjectIds: [track.id] }] };
  }), [update]);
  const restoreVersion = useCallback((version: number) => {
    const current = stateRef.current;
    const target = current.versions.find((entry) => entry.version === version);
    if (!target) return;
    history.current.push(current.timeline);
    redoHistory.current = [];
    const now = new Date().toISOString();
    const timeline = { ...structuredClone(target.timeline), version: current.timeline.version + 1 };
    const commandId = crypto.randomUUID();
    update((latest) => ({ ...latest, timeline, project: { ...latest.project, activeVersion: timeline.version, updatedAt: now }, versions: [...latest.versions, { version: timeline.version, name: `Restore: ${target.name}`, createdAt: now, timeline: structuredClone(timeline), commandId, label: "version.restore" }], auditLog: [...latest.auditLog, { id: crypto.randomUUID(), commandId, op: "version.restore", actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: timeline.version, affectedObjectIds: [timeline.id] }] }));
  }, [update]);
  const nameVersion = useCallback((version: number, name: string) => update((current) => ({ ...current, versions: current.versions.map((entry) => entry.version === version ? { ...entry, name } : entry) })), [update]);
  const canUndo = history.current.length > 0;
  const canRedo = redoHistory.current.length > 0;
  return { state, ready, saved, storageWarning, dispatch, undo, redo, replaceTimeline, addAssets, setProjectName, mutate, addTrack, restoreVersion, nameVersion, canUndo, canRedo };
}
