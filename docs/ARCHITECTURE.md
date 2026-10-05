# Architecture

## Non-negotiable data flow

`User gesture / validated structured command → version-checked timeline operation → schema-valid project state → checkpoint + audit → local autosave`

The browser editor is a view/controller over the project model, not a second source of truth. Timeline objects are addressed by stable IDs. Commands carry a project ID, command ID, and expected timeline version; stale writes fail instead of silently overwriting newer edits. `schemas/` is the data contract and `src/lib/project/validation.ts` is the runtime validator.

## Stage 1 components

- `src/lib/project/types.ts`: project, asset, timeline, command, audit, and version interfaces.
- `src/lib/project/migrations.ts`: explicit schema-version entry points; unknown formats fail closed.
- `src/lib/project/storage.ts`: separate IndexedDB stores for project metadata and original media blobs.
- `src/lib/timeline/commands.ts`: pure/deep-copy timeline command application; source files are not mutated.
- `src/lib/media/inspect.ts`: browser-level signature checks and metadata extraction. This is not FFprobe and does not generate proxies, thumbnails, or waveforms.
- `src/lib/editor/useEditor.ts`: local autosave and in-memory undo/redo/checkpoint coordination.
- `src/App.tsx`: editor UI, playback, and explicitly local browser export.

## Production target boundary

A production deployment should separate:

1. Authenticated frontend with workspace-scoped authorization.
2. Project service and append-only command/audit/version persistence.
3. Asset service that issues constrained signed upload/download URLs and enforces ownership.
4. Asynchronous job API and durable queue with idempotency, retries, cancellation, progress events, and cost controls.
5. Isolated media workers (FFprobe, antivirus/file safety, proxies, thumbnails, waveforms, transcription and render) and isolated provider adapters.
6. Private object storage and a delivery CDN with access policy and retention controls.
7. Provider/agent tool registry with JSON Schema argument validation, capability metadata, approvals, rate/cost limits, and secret isolation.

Heavy processing and provider credentials must never run in client JavaScript or in a synchronous standard serverless request. Workers consume immutable source inputs and write separate derived asset records with provenance.

## Data and reliability invariants

- Project/timeline schema versions are explicit; migrations precede format changes.
- Commands are deterministic and validated both structurally and against application invariants.
- Each meaningful state change becomes a named/checkpointable version with before/after comparison and audit context.
- Original uploaded media never changes as a side effect of editing.
- Project JSON, prompts, logs and generated assets contain no secrets.
- Asset provenance links generated/derived outputs to provider, model, inputs, and authorized generation request.

## Stage 1 limitations

The checked-in implementation is local-only. IndexedDB is not cross-device storage or backup. There is no server authentication, roles, cloud upload, worker queue, FFprobe/media processing service, collaboration, or authoritative render. Local canvas recording produces browser-supported WebM preview output only. These boundaries must be replaced/extended before commercial production workloads.
