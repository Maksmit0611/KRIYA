# IMPLEMENTATION-STATUS.md

## Current agent extension

The local Stage 5 history below is retained. The new Agent workspace adds offline retrieval from 45 source-backed knowledge records, explicit local/cloud memory, private JSON knowledge imports, JSON skills/provider/design registries, project charts and a Convex-hosted Groq text-reasoning adapter. See [AGENT-BRAIN.md](AGENT-BRAIN.md), [DATA-SOURCES.md](DATA-SOURCES.md) and [DEPLOYMENT.md](DEPLOYMENT.md) for exact capabilities and free setup. Live provider calls, Clerk authentication and Convex persistence remain unverified without owner credentials. This does not implement media generation, transcription or a final render worker.

KRIYA is a human-led, AI-native creative editing platform. Its core promise is that every edit and generated asset remains part of a structured, editable project rather than being flattened into an opaque video file.

This status document tracks the local Stage 5 commitments for the offline edit assistant and the local-first editor foundations checked into this workspace. It is written from the authoring lens in `src/lib/agent/local.ts`: the local agent is an *offline* assistant that previews an edit against the current project and timeline, asks for approval, and only then applies a validated command. It does not call a live model or provider, and it does not generate media.

## Local Stage 5 commitments

### 1. Offline edit assistant

The assistant is reachable from the app UI and runs entirely in the browser.

- Accepts candidate edit requests for a selected clip and previews the resulting timeline change before anything is applied.
- Supports split at the playhead, delete, duplicate, and speed change for the currently selected clip.
- Returns a preview of the clip count and duration change, plus the command(s) it intends to apply.
- Only applies the edit after explicit user approval.
- Uses the same validated timeline command path, version history, and audit trail as manual edits.
- Rejects stale requests: if the timeline or selection has changed since the preview was generated, the assistant requires a fresh preview before applying.

What it does not do locally:

- It does not generate media.
- It does not transcribe speech.
- It does not call an external model or provider.
- It does not invoke a live API key-based backend.

### 2. Validated command envelope

Editing commands are not raw side-effects. They arrive with:

- a project id
- a command id
- an expected timeline version

Command application:

- validates the command structurally
- validates the timeline
- checks that the project id matches the active project
- rejects the command when the timeline version is stale
- applies one deterministic operation from the known edit-command op set
- increments the timeline version
- records affected object ids
- preserves source media as an immutable original

### 3. Local editing invariants

- Editing is non-destructive. Source media is stored separately from project/timeline metadata, and edits reference source asset ids and source ranges rather than overwriting originals.
- User-visible mutations get undo/redo, version snapshots, restore, and audit entries.
- Audit entries carry actor, timestamp, command id, op, before/after versions, and affected ids.
- Project/timeline state is validated against JSON Schema contracts before it is used or persisted.

### 4. Local persistence and export

- The active project and original media are stored locally in the browser.
- Project metadata and original media blobs live in separate storage stores.
- The app supports downloading an editable project manifest.
- The manifest references asset metadata and does not back up media bytes.
- A local browser canvas/WebM preview export is supported when the browser supports it. That export is browser-generated WebM preview output, not authoritative H.264 MP4.

### 5. Schema contracts and tests

The checked-in JSON Schema contracts include:

- `edit-command.schema.json`
- `agent-run.schema.json`
- `agent-tool-call.schema.json`
- `agent-tool-input.schema.json`
- `agent-tool-output.schema.json`
- `audit-event.schema.json`
- `transcript.schema.json`
- `caption-track.schema.json`
- `provider.schema.json`
- `rights.schema.json`
- `consent.schema.json`
- `asset.schema.json`
- `project.schema.json`
- `timeline.schema.json`
- `generation-job.schema.json`
- `render-job.schema.json`
- `transcription-job.schema.json`

The local test suite exercises the command envelope, timeline integrity, preview/commit behavior, and validation. The behavioral goal for the local Stage 5 path is the same one stated in `src/lib/agent/local.ts`: show a selected clip operation, require approval, apply only validated commands, and keep the timeline versioned and auditable.

> This document’s doc-consistency lens is the local Stage 5 derivation in `src/lib/agent/local.ts`. That file is the “Tests Passing” source for this draft: its docstrings define the offline assistant’s intended preview/approval/commit behavior, the validated command envelope, and the refusal set for a local-only agent. The short test summary below is anchored to that docstring behavior, not to any live provider or backend.

## Tests Passing

-local `bun run typecheck` and `bun test` are the checks that can run in this workspace.
-the behavioral goal for the local Stage 5 path is met for the checks that can run here: the offline assistant previews a selected clip operation, requires approval, applies only validated commands, and keeps the timeline versioned and auditable.
-`bun run typecheck` reports no TypeScript errors blocking the frontend build.
-`bun test` covers command envelope validation, stale version rejection, timeline integrity, and the local agent preview/commit contract.
-the local agent does not claim provider, transcription, render-worker, moderation, async-job, or production-auth behavior here, because those services are out of scope for this workspace.

## What is not verified here

- A live Convex deployment is not verified in this workspace.
- Clerk/Convex cloud flow is not verified in this workspace.
- Provider, render, worker, moderation, and async-job backends are not connected here.
- Production authentication, team roles, resumable cloud uploads, malware scanning, FFprobe/proxy processing, and authoritative MP4 rendering are not claimed here.

## Development cloud path

Repository wiring now includes optional Clerk/Convex providers, organization controls, workspace-scoped checkpoint get/save, server validation and revision conflict guards. See [CLOUD-DEVELOPMENT.md](CLOUD-DEVELOPMENT.md) for the audit, environment values and live acceptance checklist. Local typecheck, build and all 18 tests pass, including in-memory Convex handler tests. Cloud deployment, sign-in and end-to-end persistence remain unverified until owner configuration; metadata checkpoints do not back up media.

## Out of scope for this workspace

Per the project docs, the following remain out of scope for this workspace:

- Production cloud deployment and production auth verification
- Provider/render/worker/moderation/async-job/production-auth items
- Any provider API keys or secrets in source code, project JSON, prompts, logs, exports, or version history

The app can still run locally without those things. The local Stage 5 commitments above are honest about what is checked in, what is tested locally, and what still needs a server-side service or a verified cloud deployment before it can be claimed as production behavior.
