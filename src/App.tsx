import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import {
  Activity, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clapperboard,
  Copy, Download, Eye, EyeOff, Film, Frame, Image as ImageIcon, Layers3, Lock, Maximize2, MoreHorizontal,
  Music2, Pause, Play, Plus, Redo2, Scissors, Search, Settings2, Sparkles, Trash2, Unlock, Upload, Volume2,
  VolumeX, X, ZoomIn, ZoomOut, Undo2,
} from "lucide-react";
import { useEditor } from "./lib/editor/useEditor";
import type { Asset, AuditOperation, EditingOperation, StoredEditorState, Timeline, TimelineClip, Track } from "./lib/project/types";
import { createEditingCommand } from "./lib/project/types";
import { getOriginalMedia, saveOriginalMedia } from "./lib/project/storage";
import { inspectUpload } from "./lib/media/inspect";
import { getBrowserPreviewDuration } from "./lib/media/previewDuration";
import { AgentPanel } from "./components/AgentPanel";
import type { LocalEditProposal } from "./lib/agent/local";

type ToastState = { message: string; error?: boolean };
type ContextState = { x: number; y: number; clipId: string } | null;
type DragPreview = { clipId: string; startMs: number; endMs?: number; trackId: string } | null;
type RenderConfig = { resolution: "1080p" | "720p" | "social-vertical" | "square"; frameRate: 24 | 30 | 60 };

const trackAccent: Record<Track["kind"], string> = { video: "video", audio: "audio", graphics: "graphics", captions: "captions" };
const formatTime = (ms: number) => {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  const seconds = Math.floor((Math.max(0, ms) % 60000) / 1000);
  const frames = Math.floor((Math.max(0, ms) % 1000) / (1000 / 30));
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
};
const prettySize = (bytes: number) => bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes > 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const activeAssetFor = (state: StoredEditorState, time: number) => {
  for (const track of state.timeline.tracks.filter((item) => item.kind === "video" && item.visible).slice().reverse()) {
    const clip = track.clips.find((item) => time >= item.timelineStartMs && time < item.timelineStartMs + item.durationMs);
    if (clip) return { clip, asset: state.assets.find((item) => item.id === clip.assetId) };
  }
  return undefined;
};

export default function App() {
  const editor = useEditor();
  const { state } = editor;
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(18);
  const [tool, setTool] = useState<"select" | "blade">("select");
  const [tab, setTab] = useState("Media");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextState>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview>(null);
  const [renderOpen, setRenderOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [renderConfig, setRenderConfig] = useState<RenderConfig>({ resolution: "1080p", frameRate: 30 });
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [search, setSearch] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineScroll = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clipId: string; originX: number; originMs: number; trackId: string; mode: "move" | "start" | "end" } | null>(null);
  const playheadRef = useRef(playhead);
  const playStartRef = useRef({ time: 0, wall: 0 });
  const [guides, setGuides] = useState(false);
  const [quality, setQuality] = useState("Full");
  const [fit, setFit] = useState("Fit");
  const assetURLs = mediaUrls;
  const selectedClip = useMemo(() => {
    for (const track of state.timeline.tracks) {
      const clip = track.clips.find((item) => item.id === state.selectedClipId);
      if (clip) return { clip, track };
    }
    return undefined;
  }, [state.selectedClipId, state.timeline.tracks]);
  const activeVideo = useMemo(() => activeAssetFor(state, playhead), [playhead, state]);
  const timelineDuration = state.timeline.durationMs;
  const timelineViewportDuration = Math.max(60000, timelineDuration);
  const pixelsPerMs = zoom / 1000;

  useEffect(() => { playheadRef.current = playhead; }, [playhead]);
  useEffect(() => {
    let canceled = false;
    for (const asset of state.assets) {
      if (mediaUrls[asset.id]) continue;
      getOriginalMedia(asset.storageKey).then((blob) => {
        if (!blob || canceled) return;
        const url = URL.createObjectURL(blob);
        setMediaUrls((current) => current[asset.id] ? current : { ...current, [asset.id]: url });
      }).catch((error: unknown) => console.error("Could not open original media:", error));
    }
    return () => { canceled = true; };
  }, [mediaUrls, state.assets]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (wall: number) => {
      const nextTime = playStartRef.current.time + wall - playStartRef.current.wall;
      if (nextTime >= timelineDuration) { setPlayhead(timelineDuration); setPlaying(false); return; }
      setPlayhead(nextTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, timelineDuration]);

  useEffect(() => {
    if (videoRef.current && activeVideo?.clip) videoRef.current.playbackRate = activeVideo.clip.speed;
    if (playing && videoRef.current && activeVideo?.clip && videoRef.current.paused) {
      const expected = activeVideo.clip.sourceStartMs + (playhead - activeVideo.clip.timelineStartMs) * activeVideo.clip.speed;
      if (Math.abs(videoRef.current.currentTime * 1000 - expected) > 450) videoRef.current.currentTime = expected / 1000;
      void videoRef.current.play().catch(() => undefined);
    }
    if (!playing && videoRef.current && !videoRef.current.paused) videoRef.current.pause();
  }, [activeVideo?.clip?.id, activeVideo?.clip?.speed, playing]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.code === "Space") { event.preventDefault(); setPlaying((value) => !value); }
      else if (mod && event.key.toLowerCase() === "z" && event.shiftKey) { event.preventDefault(); editor.redo(); }
      else if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); editor.undo(); }
      else if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); editor.redo(); }
      else if (event.key.toLowerCase() === "s" && !mod) { event.preventDefault(); setTool((value) => value === "blade" ? "select" : "blade"); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedClip) { event.preventDefault(); run({ op: "timeline.delete", args: { clipId: selectedClip.clip.id } }); }
      else if (event.key === "ArrowLeft") setPlayhead((time) => Math.max(0, time - 1000 / state.project.settings.fps));
      else if (event.key === "ArrowRight") setPlayhead((time) => Math.min(timelineDuration, time + 1000 / state.project.settings.fps));
      else if (event.key === "Escape") { setContextMenu(null); setRenderOpen(false); setAgentOpen(false); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const run = useCallback((operation: EditingOperation) => {
    try {
      editor.dispatch(createEditingCommand(editor.state.timeline, operation));
      setToast({ message: "Edit applied · version saved" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Edit could not be applied", error: true });
    }
  }, [editor]);

  const toggleTrack = (trackId: string, key: "locked" | "visible" | "muted" | "solo") => {
    editor.mutate((current) => {
      const timeline: Timeline = { ...current.timeline, version: current.timeline.version + 1, tracks: current.timeline.tracks.map((track) => track.id === trackId ? { ...track, [key]: !track[key] } : track) };
      const now = new Date().toISOString();
      const commandId = crypto.randomUUID();
      const operation: AuditOperation = `track.${key}`;
      return { ...current, timeline, project: { ...current.project, activeVersion: timeline.version, updatedAt: now }, versions: [...current.versions, { version: timeline.version, name: `Version ${timeline.version}`, createdAt: now, timeline: structuredClone(timeline), commandId, label: operation }], auditLog: [...current.auditLog, { id: crypto.randomUUID(), commandId, op: operation, actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: timeline.version, affectedObjectIds: [trackId] }] };
    });
  };

  const importFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((file) => file.size > 0);
    let imported = 0;
    for (const file of list) {
      try {
        const asset = await inspectUpload(file, state.project.id, state.project.workspaceId);
        await saveOriginalMedia(asset.storageKey, file);
        editor.addAssets([asset]);
        imported += 1;
      } catch (error) {
        setToast({ message: error instanceof Error ? error.message : "Import failed", error: true });
      }
    }
    if (imported) setToast({ message: `${imported} media file${imported === 1 ? "" : "s"} imported · originals remain unchanged` });
  };

  const setProjectAspect = (width: number, height: number) => {
    editor.mutate((current) => {
      const now = new Date().toISOString();
      const next = { ...current, project: { ...current.project, settings: { ...current.project.settings, width, height }, updatedAt: now } };
      const commandId = crypto.randomUUID();
      return { ...next, auditLog: [...current.auditLog, { id: crypto.randomUUID(), commandId, op: "project.settings", actor: "local-user", timestamp: now, beforeVersion: current.timeline.version, afterVersion: current.timeline.version, affectedObjectIds: [current.project.id] }] };
    });
  };
  const insertAsset = (asset: Asset, trackId?: string) => {
    const assetTrackKind: Track["kind"] = asset.kind === "audio" || asset.kind === "music" || asset.kind === "sound-effect" || asset.kind === "voice" ? "audio" : asset.kind === "graphic" ? "graphics" : asset.kind === "subtitle" ? "captions" : "video";
    const defaultTrack = state.timeline.tracks.find((track) => track.kind === assetTrackKind);
    run({ op: "timeline.insert", args: { trackId: trackId ?? defaultTrack?.id ?? state.timeline.tracks[0].id, assetId: asset.id, atMs: playhead } });
  };

  const startPlayback = () => {
    if (playing) { setPlaying(false); return; }
    if (playhead >= timelineDuration) setPlayhead(0);
    playStartRef.current = { time: playhead >= timelineDuration ? 0 : playhead, wall: performance.now() };
    setPlaying(true);
  };
  const chooseFile = () => uploadInput.current?.click();
  const exportProjectJson = () => {
    const blob = new Blob([JSON.stringify({ project: state.project, timeline: state.timeline, assets: state.assets, versions: state.versions, auditLog: state.auditLog }, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${safeName(state.project.name)}.kriya.json`);
    setToast({ message: "Editable project manifest downloaded" });
  };
  const startRender = async () => {
    setRenderBusy(true); setRenderProgress(1);
    try {
      const blob = await renderBrowserPreview(state, assetURLs, renderConfig, (progress) => setRenderProgress(progress));
      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      downloadBlob(blob, `${safeName(state.project.name)}.${extension}`);
      setToast({ message: `Browser preview export ready · ${extension.toUpperCase()}` });
      setRenderOpen(false);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Browser render failed", error: true });
    } finally { setRenderBusy(false); setRenderProgress(null); }
  };

  return (
    <div className="app-shell" onClick={() => contextMenu && setContextMenu(null)}>
      <input ref={uploadInput} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.currentTarget.value = ""; }} />
      {editor.storageWarning && <div className="storage-warning" role="alert" title={editor.storageWarning}>{editor.storageWarning}</div>}
      <header className="topbar">
        <div className="brand">KRIYA<span className="brand-dot">.</span></div>
        <div className="project-name"><ChevronRight size={13} color="#73757a" /><input aria-label="Project name" value={state.project.name} onChange={(event) => editor.setProjectName(event.target.value)} /><span className="save-status"><i className="save-light" />{editor.saved ? "SAVED" : "SAVING"}</span></div>
        <div className="top-actions">
          <button className="icon-button" title="Undo · Ctrl Z" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={15} /></button>
          <button className="icon-button" title="Redo · Ctrl Shift Z" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={15} /></button>
          <span className="top-divider" />
          <select className="top-select" aria-label="Project version" value={state.timeline.version} onChange={(event) => editor.restoreVersion(Number(event.target.value))}><option value={state.timeline.version}>Version {state.timeline.version} · Current</option>{[...state.versions].reverse().map((version) => <option key={version.version} value={version.version}>{version.name} · {version.label}</option>)}</select>
          <select className="top-select" aria-label="Project aspect ratio" value={`${state.project.settings.width}:${state.project.settings.height}`} onChange={(event) => { const [width, height] = event.target.value.split(":").map(Number); setProjectAspect(width, height); }}><option value="1920:1080">16:9 · 1080p</option><option value="1080:1920">9:16 · Vertical</option><option value="1080:1080">1:1 · Square</option></select>
          <button className="icon-button" title="Download editable project manifest" onClick={exportProjectJson}><Download size={15} /></button>
          <button className="secondary-button" onClick={() => setAgentOpen(true)}><Sparkles size={14} /> Agent</button>
          <button className="primary-button" onClick={() => setRenderOpen(true)}><Clapperboard size={14} /> Render <ChevronDown size={12} /></button>
        </div>
      </header>
      <main className={`workspace${draggingOver ? " is-importing" : ""}`} onDragOver={(event) => { event.preventDefault(); setDraggingOver(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingOver(false); }} onDrop={(event) => { event.preventDefault(); setDraggingOver(false); if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files); }}>
        <aside className="media-panel">
          <div className="panel-tabs">{["Media", "Generations", "Characters", "Graphics", "Text", "Audio", "Effects"].map((name) => <button key={name} className={`panel-tab${tab === name ? " active" : ""}`} onClick={() => setTab(name)}>{name}</button>)}</div>
          <div className="panel-content">
            <div className="section-heading">PROJECT MEDIA <span>{state.assets.length} ASSETS</span></div>
            <div className={`drop-zone${draggingOver ? " dragging" : ""}`} onClick={chooseFile} onDragOver={(event) => { event.preventDefault(); setDraggingOver(true); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDraggingOver(false); void importFiles(event.dataTransfer.files); }}><Upload size={17} color="#d5ff5f" /><strong>Drop files to import</strong><span>VIDEO · AUDIO · IMAGE · UP TO 8 GB</span></div>
            <div className="library-heading"><span>ASSETS {tab !== "Media" ? `· ${tab.toUpperCase()}` : ""}</span><button onClick={chooseFile}>+ IMPORT</button></div>
            <div className="search-box"><Search size={12} /><input aria-label="Search assets" placeholder="Search project media" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            {state.assets.filter((asset) => asset.fileName.toLowerCase().includes(search.toLowerCase())).map((asset) => <AssetRow key={asset.id} asset={asset} onInsert={() => insertAsset(asset)} />)}
            {state.assets.length === 0 && <div className="library-empty">Your source media will live here.<br />Imports stay untouched; edits happen on the timeline.</div>}
            <div className="library-heading"><span>PROJECT BINS</span><button onClick={() => setToast({ message: "Bins are coming in a later project schema version." })}>+ NEW</button></div>
            <div className="bin-row"><Layers3 size={13} /> All media <span>{state.assets.length}</span></div>
            <div className="storage-note"><Lock size={11} /> Local project · private to this browser</div>
          </div>
        </aside>
        <section className="center-area">
          <div className="viewer-header"><span>VIEWER <i>·</i> {state.project.settings.width} × {state.project.settings.height}</span><div className="viewer-tools"><select aria-label="Preview quality" className="top-select" value={quality} onChange={(event) => setQuality(event.target.value)}><option>Full</option><option>Half</option><option>Quarter</option></select><select aria-label="Viewer fit" className="top-select" value={fit} onChange={(event) => setFit(event.target.value)}><option>Fit</option><option>25%</option><option>50%</option><option>100%</option></select><button className={`icon-button${guides ? " enabled" : ""}`} title="Safe area guides" onClick={() => setGuides((value) => !value)}><Frame size={14} /></button><button className="icon-button" title="Fullscreen viewer" onClick={(event) => event.currentTarget.closest(".center-area")?.requestFullscreen()}><Maximize2 size={13} /></button></div></div>
          <div className="viewer-frame"><div className="canvas" style={{ aspectRatio: `${state.project.settings.width}/${state.project.settings.height}` }}>
            {activeVideo?.asset && assetURLs[activeVideo.asset.id] && ((activeVideo.asset.kind === "image" || activeVideo.asset.kind === "generated-image" || activeVideo.asset.mimeType.startsWith("image/")) ? <img src={assetURLs[activeVideo.asset.id]} alt={activeVideo.asset.fileName} style={transformStyle(activeVideo.clip)} /> : <video ref={videoRef} key={activeVideo.clip.id} src={assetURLs[activeVideo.asset.id]} muted playsInline preload="metadata" onTimeUpdate={(event) => { const media = event.currentTarget; if (!playing && activeVideo.clip && Math.abs(media.currentTime * 1000 - (activeVideo.clip.sourceStartMs + Math.max(0, playhead - activeVideo.clip.timelineStartMs) * activeVideo.clip.speed)) > 350) media.currentTime = (activeVideo.clip.sourceStartMs + Math.max(0, playhead - activeVideo.clip.timelineStartMs) * activeVideo.clip.speed) / 1000; }} onLoadedMetadata={(event) => { const video = event.currentTarget; if (activeVideo.clip) { video.currentTime = (activeVideo.clip.sourceStartMs + Math.max(0, playhead - activeVideo.clip.timelineStartMs) * activeVideo.clip.speed) / 1000; if (playing) void video.play().catch(() => undefined); } }} style={transformStyle(activeVideo.clip)} />)}
            {guides && <div className="canvas-grid" />}{!activeVideo && <div className="viewer-placeholder"><div className="viewer-mark"><Film size={24} /></div><strong>Make something worth seeing.</strong><span>Import footage or drop an asset on the timeline to begin.</span></div>}
          </div></div>
          <div className="playback-bar"><button className="play-small" title="Previous frame" onClick={() => setPlayhead((time) => Math.max(0, time - 1000 / state.project.settings.fps))}><ChevronLeft size={17} /></button><button className="play-main" aria-label={playing ? "Pause" : "Play"} onClick={startPlayback}>{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button className="play-small" title="Next frame" onClick={() => setPlayhead((time) => Math.min(timelineDuration, time + 1000 / state.project.settings.fps))}><ChevronRight size={17} /></button><span className="play-time">{formatTime(playhead)} <i>/</i> {formatTime(timelineDuration)}</span></div>
        </section>
        <Inspector selected={selectedClip} state={state} run={run} />
        <section className="timeline">
          <div className="timeline-toolbar"><div className="timeline-tools"><button title="Selection tool (V)" className={`tool-button${tool === "select" ? " active" : ""}`} onClick={() => setTool("select")}>↖</button><button title="Blade tool (S)" className={`tool-button${tool === "blade" ? " active" : ""}`} onClick={() => setTool("blade")}><Scissors size={13} /></button><span className="top-divider" /><button className="tool-button" title="Split at playhead" onClick={() => selectedClip && run({ op: "timeline.split", args: { clipId: selectedClip.clip.id, atMs: playhead } })}>SPLIT</button><button className="tool-button" title="Ripple delete selected clip" onClick={() => selectedClip && run({ op: "timeline.rippleDelete", args: { trackIds: state.timeline.tracks.map((track) => track.id), startMs: selectedClip.clip.timelineStartMs, endMs: selectedClip.clip.timelineStartMs + selectedClip.clip.durationMs, preserveSync: true } })}>RIPPLE</button><button className="tool-button" title="Add video track" onClick={() => editor.addTrack("video")}><Plus size={13} /> V</button><button className="tool-button" title="Add audio track" onClick={() => editor.addTrack("audio")}><Plus size={13} /> A</button><button className="tool-button" title="Duplicate selected clip" onClick={() => selectedClip && run({ op: "timeline.duplicate", args: { clipId: selectedClip.clip.id } })}><Copy size={12} /></button></div><div className="timeline-zoom"><ZoomOut size={12} /><input aria-label="Timeline zoom" type="range" min="5" max="80" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><ZoomIn size={12} /><button className="icon-button" title="Fit timeline" onClick={() => { setZoom(Math.max(5, Math.min(80, 1100 / (timelineViewportDuration / 1000)))); if (timelineScroll.current) timelineScroll.current.scrollLeft = 0; }}><Settings2 size={13} /></button></div></div>
          <div className="timeline-body"><div className="track-labels"><div className="ruler-spacer" />{state.timeline.tracks.map((track) => <div className="track-label" key={track.id} style={{ height: track.kind === "video" && track.name.includes("V1") ? 61 : undefined }}><i className={`track-color ${trackAccent[track.kind]}`} /><span className="track-label-name">{track.name}</span><div className="track-controls"><button className={track.locked ? "on" : ""} title="Lock track" onClick={() => toggleTrack(track.id, "locked")}>{track.locked ? <Lock size={10} /> : <Unlock size={10} />}</button><button className={track.muted || !track.visible ? "on" : ""} title={track.kind === "audio" ? "Mute track" : "Toggle track visibility"} onClick={() => toggleTrack(track.id, track.kind === "audio" ? "muted" : "visible")}>{track.kind === "audio" ? track.muted ? <VolumeX size={10} /> : <Volume2 size={10} /> : track.visible ? <Eye size={10} /> : <EyeOff size={10} />}</button></div></div>)}</div>
            <div className="timeline-scroll" ref={timelineScroll} onClick={(event) => { if ((event.target as HTMLElement).closest(".timeline-clip, .ruler")) return; const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left + event.currentTarget.scrollLeft; setPlayhead(Math.max(0, x / pixelsPerMs)); }} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
              <div className="timeline-canvas" style={{ width: Math.max(1200, timelineViewportDuration * pixelsPerMs), backgroundSize: `${pixelsPerMs * 5000}px 100%` }}>
                <div className="ruler" onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setPlayhead(Math.max(0, (event.clientX - rect.left + (timelineScroll.current?.scrollLeft ?? 0)) / pixelsPerMs)); }}>{Array.from({ length: Math.ceil(timelineViewportDuration / 5000) + 1 }, (_, index) => <span className="ruler-tick" key={index} style={{ left: index * 5000 * pixelsPerMs }}>{`${String(Math.floor(index * 5 / 60)).padStart(2, "0")}:${String(index * 5 % 60).padStart(2, "0")}`}</span>)}<div className="playhead" style={{ left: playhead * pixelsPerMs }} /></div>
                {state.timeline.tracks.map((track) => <div className="track-lane" key={track.id} data-track-id={track.id} style={{ height: track.kind === "video" && track.name.includes("V1") ? 61 : undefined }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const assetId = event.dataTransfer.getData("application/kriya-asset"); const asset = state.assets.find((item) => item.id === assetId); if (asset) { const rect = event.currentTarget.getBoundingClientRect(); run({ op: "timeline.insert", args: { trackId: track.id, assetId: asset.id, atMs: Math.max(0, (event.clientX - rect.left + (timelineScroll.current?.scrollLeft ?? 0)) / pixelsPerMs) } }); } }}>
                  {track.clips.map((clip) => { const asset = state.assets.find((item) => item.id === clip.assetId); const preview = dragPreview?.clipId === clip.id ? dragPreview : undefined; return <div key={clip.id} className={`timeline-clip${asset?.kind === "audio" || asset?.kind === "music" || asset?.kind === "voice" || asset?.kind === "sound-effect" ? " audio" : asset?.kind.includes("image") || asset?.mimeType.startsWith("image/") ? " image" : ""}${state.selectedClipId === clip.id ? " selected" : ""}`} style={{ left: (preview?.startMs ?? clip.timelineStartMs) * pixelsPerMs, width: Math.max(7, (preview?.endMs ?? clip.durationMs) * pixelsPerMs), top: preview?.trackId === track.id ? 5 : undefined, opacity: preview && preview.trackId !== track.id ? 0.25 : undefined }} onClick={(event) => { event.stopPropagation(); if (tool === "blade") run({ op: "timeline.split", args: { clipId: clip.id, atMs: playhead } }); else editor.mutate((current) => ({ ...current, selectedClipId: clip.id, selectedTrackId: track.id })); }} onDoubleClick={() => setPlayhead(clip.timelineStartMs)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, clipId: clip.id }); }} onPointerDown={(event) => { if (tool !== "select" || track.locked) return; const target = event.target as HTMLElement; const edge = target.dataset.edge; if (!edge && target.closest(".clip-title")) return; event.stopPropagation(); editor.mutate((current) => ({ ...current, selectedClipId: clip.id, selectedTrackId: track.id })); dragRef.current = { clipId: clip.id, originX: event.clientX, originMs: clip.timelineStartMs, trackId: track.id, mode: edge === "start" ? "start" : edge === "end" ? "end" : "move" }; event.currentTarget.setPointerCapture(event.pointerId); }}><div className="clip-handle start" data-edge="start" /><span className="clip-title">{asset?.fileName ?? "Missing media"}</span>{track.kind === "audio" && <span className="clip-waveform" />}<div className="clip-handle end" data-edge="end" /></div>; })}
                </div>)}
                {!state.timeline.tracks.some((track) => track.clips.length) && <div className="timeline-empty">DROP MEDIA HERE · BUILD YOUR CUT</div>}<div className="playhead" style={{ left: playhead * pixelsPerMs, top: 0 }} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="statusbar"><span title={editor.storageWarning ?? undefined}><i className="status-dot" /> {editor.storageWarning ? "STORAGE NEEDS ATTENTION" : editor.ready ? "LOCAL PROJECT" : "OPENING PROJECT"}</span><span>{state.project.settings.fps} FPS <i>·</i> REC.709 <i>·</i> {state.timeline.tracks.length} TRACKS</span><button onClick={exportProjectJson}>PROJECT DATA <ChevronDown size={11} /></button></footer>
      {contextMenu && <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(event) => event.stopPropagation()}><button onClick={() => run({ op: "timeline.duplicate", args: { clipId: contextMenu.clipId } })}><Copy size={12} /> Duplicate clip</button><button onClick={() => run({ op: "timeline.split", args: { clipId: contextMenu.clipId, atMs: playhead } })}><Scissors size={12} /> Split at playhead</button><button onClick={() => run({ op: "timeline.delete", args: { clipId: contextMenu.clipId } })}><Trash2 size={12} /> Delete clip</button></div>}
      {renderOpen && <RenderModal config={renderConfig} setConfig={setRenderConfig} progress={renderProgress} busy={renderBusy} timeline={state.timeline} previewDurationMs={getBrowserPreviewDuration(state.timeline, state.assets)} onClose={() => !renderBusy && setRenderOpen(false)} onStart={() => void startRender()} onProject={exportProjectJson} />}
      {agentOpen && <AgentPanel state={state} playheadMs={playhead} onClose={() => setAgentOpen(false)} onApply={(proposal: LocalEditProposal) => { editor.dispatch(proposal.command); setToast({ message: "Agent edit applied · version saved" }); }} />}
      {toast && <div className={`toast${toast.error ? " error" : ""}`}>{toast.error ? <CircleHelp size={13} /> : <Check size={13} />} {toast.message}</div>}
    </div>
  );

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = Math.round((event.clientX - drag.originX) / pixelsPerMs / 10) * 10;
    const clip = state.timeline.tracks.flatMap((track) => track.clips).find((item) => item.id === drag.clipId);
    if (!clip) return;
    if (drag.mode === "move") {
      const hoveredLane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".track-lane");
      const targetTrackId = hoveredLane?.dataset.trackId ?? drag.trackId;
      setDragPreview({ clipId: drag.clipId, startMs: Math.max(0, drag.originMs + delta), trackId: targetTrackId });
    } else if (drag.mode === "end") setDragPreview({ clipId: drag.clipId, startMs: clip.timelineStartMs, endMs: Math.max(100, clip.durationMs + delta), trackId: drag.trackId });
    else setDragPreview({ clipId: drag.clipId, startMs: Math.max(0, drag.originMs + delta), endMs: Math.max(100, clip.durationMs - delta), trackId: drag.trackId });
  }
  function handlePointerUp() {
    const drag = dragRef.current; dragRef.current = null;
    if (!drag || !dragPreview) return;
    const preview = dragPreview; setDragPreview(null);
    if (drag.mode === "move") run({ op: "timeline.move", args: { clipId: drag.clipId, trackId: preview.trackId, toMs: preview.startMs } });
    else if (drag.mode === "end") run({ op: "timeline.trim", args: { clipId: drag.clipId, edge: "end", toMs: dragPreview.endMs! + drag.originMs } });
    else run({ op: "timeline.trim", args: { clipId: drag.clipId, edge: "start", toMs: preview.startMs } });
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function safeName(name: string) { return name.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "kriya-project"; }
function transformStyle(clip: TimelineClip): CSSProperties { return { objectFit: "contain", transform: `translate(${clip.transform.x}%, ${clip.transform.y}%) scale(${clip.transform.scaleX}, ${clip.transform.scaleY}) rotate(${clip.transform.rotation}deg)`, opacity: clip.opacity }; }

function AssetRow({ asset, onInsert }: { asset: Asset; onInsert: () => void }) {
  const icon = asset.kind === "audio" || asset.kind === "music" || asset.kind === "voice" || asset.kind === "sound-effect" ? <Music2 size={14} /> : asset.kind.includes("image") || asset.mimeType.startsWith("image/") ? <ImageIcon size={14} /> : <Film size={14} />;
  return <div className="asset-row" draggable onDragStart={(event) => { event.dataTransfer.setData("application/kriya-asset", asset.id); event.dataTransfer.effectAllowed = "copy"; }} onDoubleClick={onInsert} onClick={onInsert} title="Click or drag to insert on the timeline"><div className={`asset-thumb ${asset.kind}`}>{icon}{asset.kind === "video" && <span className="thumb-play"><Play size={10} fill="currentColor" /></span>}</div><div className="asset-info"><strong>{asset.fileName}</strong><span>{asset.kind.toUpperCase()} · {asset.durationMs ? formatTime(asset.durationMs) : prettySize(asset.fileSize)}</span></div><MoreHorizontal className="asset-menu" size={15} /></div>;
}

function Inspector({ selected, state, run }: { selected: { clip: TimelineClip; track: Track } | undefined; state: StoredEditorState; run: (operation: EditingOperation) => void }) {
  if (!selected) return <aside className="inspector"><div className="inspector-top">INSPECTOR <Settings2 size={13} /></div><div className="inspector-content"><div className="inspect-empty"><Layers3 size={18} /><br />Select a clip to inspect its properties and make precise adjustments.</div><div className="inspector-group"><div className="inspector-label">SEQUENCE</div><div className="property-row"><span>Resolution</span><span className="property-value">{state.project.settings.width} × {state.project.settings.height}</span></div><div className="property-row"><span>Frame rate</span><span className="property-value">{state.project.settings.fps} fps</span></div><div className="property-row"><span>Duration</span><span className="property-value">{formatTime(state.timeline.durationMs)}</span></div></div><div className="inspector-group"><div className="inspector-label">PROJECT HISTORY</div>{state.versions.slice(-4).reverse().map((version) => <div className="version-row" key={version.version}><span className="version-number">V{version.version}</span><span>{version.name}</span><span className="version-label">{version.label}</span></div>)}{state.versions.length === 0 && <div className="inspector-footnote">Your first edit creates a versioned checkpoint.</div>}</div><div className="inspector-group"><div className="inspector-label">AUDIT TRAIL <span>{state.auditLog.length} EVENTS</span></div><div className="inspector-footnote">Deterministic edits are recorded locally with affected object IDs and version numbers.</div></div></div></aside>;
  const { clip } = selected;
  const updateTransform = (key: "x" | "y" | "scaleX" | "scaleY" | "rotation", value: number) => run({ op: "timeline.transform", args: { clipId: clip.id, transform: { [key]: value } } });
  return <aside className="inspector"><div className="inspector-top">INSPECTOR <Settings2 size={13} /></div><div className="inspector-content"><div className="inspect-title">{state.assets.find((asset) => asset.id === clip.assetId)?.fileName ?? "Timeline clip"}</div><div className="inspect-subtitle">{selected.track.name} · {formatTime(clip.durationMs)}</div>
    <div className="inspector-group"><div className="inspector-label">TRANSFORM</div><div className="property-pair">{([["X", "x"], ["Y", "y"]] as const).map(([label, key]) => <div className="property-row" key={key}><span>{label}</span><input aria-label={label} type="number" value={clip.transform[key]} onChange={(event) => updateTransform(key, Number(event.target.value))} /></div>)}</div><div className="property-pair">{([["SCALE X", "scaleX"], ["SCALE Y", "scaleY"]] as const).map(([label, key]) => <div className="property-row" key={key}><span>{label}</span><input aria-label={label} type="number" min="0.01" max="20" step="0.1" value={Number(clip.transform[key].toFixed(2))} onChange={(event) => updateTransform(key, Number(event.target.value))} /></div>)}</div><div className="property-row"><span>Rotation</span><input aria-label="Rotation" type="number" value={clip.transform.rotation} onChange={(event) => updateTransform("rotation", Number(event.target.value))} /></div></div>
    <div className="inspector-group"><div className="inspector-label">OPACITY <span>{Math.round(clip.opacity * 100)}%</span></div><input className="range-control" aria-label="Opacity" type="range" min="0" max="1" step="0.01" value={clip.opacity} onChange={(event) => run({ op: "timeline.setOpacity", args: { clipId: clip.id, opacity: Number(event.target.value) } })} /></div>
    <div className="inspector-group"><div className="inspector-label">AUDIO <span>{Math.round(clip.gain * 100)}%</span></div><div className="property-row"><span>Clip gain</span><input aria-label="Clip gain" type="number" min="0" max="4" step="0.1" value={Number(clip.gain.toFixed(1))} onChange={(event) => run({ op: "audio.setGain", args: { clipId: clip.id, gain: Number(event.target.value) } })} /></div><button className="mute-button" onClick={() => run({ op: "audio.setGain", args: { clipId: clip.id, gain: clip.gain, muted: !clip.muted } })}>{clip.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}{clip.muted ? "UNMUTE CLIP" : "MUTE CLIP"}</button></div>
    <div className="inspector-group"><div className="inspector-label">TIME REMAPPING</div><div className="property-row"><span>Speed</span><select aria-label="Clip speed" value={clip.speed} onChange={(event) => run({ op: "timeline.setSpeed", args: { clipId: clip.id, speed: Number(event.target.value) } })}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option></select></div></div><button className="delete-button" onClick={() => run({ op: "timeline.delete", args: { clipId: clip.id } })}><Trash2 size={12} /> DELETE CLIP</button></div></aside>;
}

function RenderModal({ config, setConfig, progress, busy, timeline, previewDurationMs, onClose, onStart, onProject }: { config: RenderConfig; setConfig: (config: RenderConfig) => void; progress: number | null; busy: boolean; timeline: Timeline; previewDurationMs: number; onClose: () => void; onStart: () => void; onProject: () => void }) {
  const [tab, setTab] = useState<"preview" | "project">("preview");
  const size = config.resolution === "720p" ? "1280 × 720" : config.resolution === "social-vertical" ? "1080 × 1920" : config.resolution === "square" ? "1080 × 1080" : "1920 × 1080";
  const frameCount = Math.ceil(previewDurationMs / 1000 * config.frameRate);
  return <div className="render-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="render-modal">
    <div className="render-header"><div><span className="eyebrow">DELIVERY · LOCAL</span><h2>Render your cut</h2></div><button className="icon-button" onClick={onClose} disabled={busy}><X size={15} /></button></div>
    <p>Export a local browser-rendered preview, or download the editable project with its complete timeline and version history.</p>
    <div className="render-tabs"><button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>VIDEO PREVIEW</button><button className={tab === "project" ? "active" : ""} onClick={() => setTab("project")}>EDITABLE PROJECT</button></div>
    {tab === "preview" ? <>
      <div className="render-fields"><label>DELIVERY FORMAT<select disabled={busy} value={config.resolution} onChange={(event) => setConfig({ ...config, resolution: event.target.value as RenderConfig["resolution"] })}><option value="1080p">16:9 · 1080p</option><option value="720p">16:9 · 720p</option><option value="social-vertical">9:16 · Social vertical</option><option value="square">1:1 · Square</option></select></label><label>FRAME RATE<select disabled={busy} value={config.frameRate} onChange={(event) => setConfig({ ...config, frameRate: Number(event.target.value) as RenderConfig["frameRate"] })}><option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></label></div>
      <div className="render-summary"><span>FRAME SIZE</span><strong>{size}</strong><span>VIDEO</span><strong>WebM · browser codec</strong><span>SEQUENCE DURATION</span><strong>{formatTime(timeline.durationMs)}</strong><span>PICTURE DURATION</span><strong>{formatTime(previewDurationMs)}</strong><span>EST. FRAMES</span><strong>{frameCount.toLocaleString()}</strong><span>RENDER PATH</span><strong>Local browser · no upload</strong></div>
      {progress !== null && <><div className="render-progress"><span style={{ width: `${progress}%` }} /></div><div className="render-progress-label">{progress < 100 ? `Rendering local preview · ${Math.round(progress)}%` : "Encoding complete"}</div></>}
      <div className="render-footnote"><CircleHelp size={12} /> Browser preview export only. Authoritative H.264 MP4 rendering requires a managed render worker; it is not connected in this foundation.</div>
    </> : <div className="project-export-info"><div className="export-icon"><Layers3 size={18} /></div><div><strong>Editable KRIYA project</strong><span>Versioned JSON manifest · timeline · asset metadata · audit history</span></div><p>Original media stays in your browser's local storage. The manifest does not embed source files; keep your originals backed up.</p></div>}
    <div className="render-footer"><button className="secondary-button" onClick={onClose} disabled={busy}>CANCEL</button>{tab === "preview" ? <button className="primary-button" onClick={onStart} disabled={busy}>{busy ? <><Activity size={13} /> RENDERING…</> : <><Clapperboard size={13} /> RENDER PREVIEW</>}</button> : <button className="primary-button" onClick={onProject}><Download size={13} /> DOWNLOAD PROJECT</button>}</div>
  </div></div>;
}

async function renderBrowserPreview(state: StoredEditorState, urls: Record<string, string>, config: RenderConfig, onProgress: (progress: number) => void): Promise<Blob> {
  const duration = getBrowserPreviewDuration(state.timeline, state.assets);
  if (duration <= 0) throw new Error("Add a visible video or image clip to the timeline before rendering a picture preview.");
  if (duration > 600000) throw new Error("Local browser previews are limited to 10 minutes. Split the project or render a shorter sequence.");
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error("This browser does not support canvas video recording. Download the editable project instead.");
  const [width, height] = config.resolution === "720p" ? [1280, 720] : config.resolution === "social-vertical" ? [1080, 1920] : config.resolution === "square" ? [1080, 1080] : [1920, 1080];
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Could not create the browser render canvas.");
  const stream = canvas.captureStream(config.frameRate);
  const videos: Array<{ clip: TimelineClip; track: Track; asset: Asset; media: HTMLVideoElement }> = [];
  const images: Array<{ clip: TimelineClip; track: Track; media: HTMLImageElement }> = [];
  for (const track of state.timeline.tracks.filter((item) => item.kind === "video" && item.visible)) {
    for (const clip of track.clips) {
      const asset = state.assets.find((item) => item.id === clip.assetId); const url = asset ? urls[asset.id] : undefined;
      if (!asset) throw new Error(`Clip ${clip.id} references missing media.`);
      if (!url) throw new Error(`Original media is still loading for ${asset.fileName}. Please retry the preview.`);
      if (asset.kind === "image" || asset.kind === "generated-image" || asset.mimeType.startsWith("image/")) { const image = new Image(); image.src = url; await new Promise<void>((resolve, reject) => { if (image.complete && image.naturalWidth) resolve(); else { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not decode ${asset.fileName}.`)); } }); images.push({ clip, track, media: image }); }
      else { const media = document.createElement("video"); media.src = url; media.preload = "auto"; media.muted = true; media.playsInline = true; await new Promise<void>((resolve, reject) => { media.onloadedmetadata = () => resolve(); media.onerror = () => reject(new Error(`Could not decode ${asset.fileName}.`)); media.load(); }); videos.push({ clip, track, asset, media }); }
    }
  }
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType }); const chunks: BlobPart[] = [];
  const finished = new Promise<Blob>((resolve, reject) => { recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); }; recorder.onerror = () => reject(new Error("Browser encoder failed while rendering the preview.")); recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" })); });
  const frameDuration = 1000 / config.frameRate; const started = performance.now(); recorder.start(1000);
  await new Promise<void>((resolve) => {
    let frame = 0;
    const renderFrame = () => {
      const time = Math.min(duration, frame * frameDuration); context.fillStyle = "#111214"; context.fillRect(0, 0, width, height);
      for (const item of videos) if (time >= item.clip.timelineStartMs && time < item.clip.timelineStartMs + item.clip.durationMs) { const sourceTime = (item.clip.sourceStartMs + (time - item.clip.timelineStartMs) * item.clip.speed) / 1000; if (Math.abs(item.media.currentTime - sourceTime) > 0.08) { try { item.media.currentTime = sourceTime; } catch { /* decode on following frame */ } } drawMediaFrame(context, item.media, width, height, item.clip); }
      for (const item of images) if (time >= item.clip.timelineStartMs && time < item.clip.timelineStartMs + item.clip.durationMs) drawMediaFrame(context, item.media, width, height, item.clip);
      frame += 1; onProgress(Math.min(99, time / duration * 100));
      if (time >= duration || frame > config.frameRate * 600) { onProgress(100); resolve(); return; }
      window.setTimeout(renderFrame, Math.max(0, started + frame * frameDuration - performance.now()));
    };
    renderFrame();
  });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 150)); recorder.stop();
  const blob = await finished; stream.getTracks().forEach((track) => track.stop()); videos.forEach(({ media }) => { media.pause(); media.removeAttribute("src"); media.load(); });
  if (blob.size < 1000) throw new Error("The browser encoder returned an empty preview.");
  return blob;
}

function drawMediaFrame(context: CanvasRenderingContext2D, media: HTMLVideoElement | HTMLImageElement, width: number, height: number, clip: TimelineClip) {
  const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth; const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight) * Math.max(clip.transform.scaleX, clip.transform.scaleY); const drawWidth = sourceWidth * scale; const drawHeight = sourceHeight * scale;
  context.save(); context.globalAlpha = clip.opacity; context.translate(width / 2 + clip.transform.x * width / 100, height / 2 + clip.transform.y * height / 100); context.rotate(clip.transform.rotation * Math.PI / 180); context.scale(clip.transform.scaleX / Math.max(clip.transform.scaleX, clip.transform.scaleY), clip.transform.scaleY / Math.max(clip.transform.scaleX, clip.transform.scaleY)); context.drawImage(media, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight); context.restore();
}
