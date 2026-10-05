# KRIYA

KRIYA is a human-led, AI-native creative editing platform. Its core promise is that every edit and generated asset remains part of a structured, editable project rather than being flattened into an opaque video file.

## Stage 1 editor foundation

This repository currently provides a local-first browser editing foundation:

- Versioned project and multitrack timeline contracts with strict JSON Schema validation.
- Typed, deterministic editing commands that reject stale timeline versions.
- Non-destructive clip editing: source media remains a separate immutable original.
- Browser media import with MIME and file-signature checks, metadata probing, and IndexedDB persistence.
- Multi-track timeline with drag, split, trim, move, duplicate, delete, ripple delete, snapping-ready structure, and keyboard undo/redo.
- Clip inspector for transforms, opacity, audio gain/mute, and speed.
- Autosaved local project state, version snapshots, restore, audit entries, and editable project-manifest download.
- A local browser canvas/WebM preview export, when supported by the browser.

The supported local export is a silent browser-generated WebM picture preview—not authoritative H.264 MP4. It uses visible video/image clips and does not mix audio, captions, graphics, or transitions. MediaRecorder output, codec availability, large source-file limits, and browser memory vary by device. Final delivery needs an asynchronous managed render worker and must be verified before production use.

## Run locally

Requirements: Bun 1.1+ and a modern browser with IndexedDB.

```sh
bun install
bun run dev
```

The Vite server binds to `0.0.0.0`; Freebuff supplies the isolated preview port.

```sh
bun run typecheck
bun test
```

## How to use the editor

1. Import video, audio, or images from the media panel (or drag them into the app).
2. Click an asset to insert it at the playhead, or drag it to a track.
3. Add video/audio tracks with `+ V` and `+ A`.
4. Select clips, drag to move, drag the edges to trim, use the blade tool (`S`) to split, or use ripple delete.
5. Adjust clip properties in the inspector. Undo/redo with `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`.
6. Use the Render menu for a local browser preview or to download the editable project JSON manifest.

Original media and the active project are stored only in that browser profile. The JSON manifest references asset metadata but does not contain or back up media bytes. Do not clear browser storage until you have exported the project manifest and preserved your source files separately.

## Architecture boundaries

`src/lib/project/types.ts` defines the canonical project, asset, timeline, clip, version, and audit types. `schemas/` contains JSON Schema contracts. `src/lib/timeline/commands.ts` validates and applies non-mutating timeline operations. `src/lib/project/storage.ts` stores local project metadata and original blobs in separate IndexedDB stores. React views render that state and dispatch commands; provider/model SDKs are not embedded in the editor.

See [`AGENTS.md`](./AGENTS.md) for required architectural and safety rules.

## Not implemented in this stage

This scaffold has no server registration/login/password recovery, account/workspace membership or role enforcement; no cloud project sync/collaboration; no resumable signed upload, malware scanning, object storage/CDN, FFprobe, proxy/thumbnail/waveform generation, or worker queue; and no transcription, provider integrations, agent tools, generation, publishing, or rights/consent service. The initial UX is a single local project. IndexedDB durability is limited by browser quota and browser/device loss.

These are explicit production architecture gaps—not mocked capabilities. Add them as separate server-side services/jobs without changing the project/timeline source-of-truth contracts or leaking credentials into the client.
