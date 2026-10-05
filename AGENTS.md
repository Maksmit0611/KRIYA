# Product

This repository implements KRIYA, an AI-native professional video editing and generation platform. Stage 1 is an ordinary, local-first video editor that remains useful while every external AI provider is disconnected.

# Core architecture

- The versioned `Project` and `Timeline` representations are canonical. UI state is a projection of these records, never an alternate timeline truth.
- Uploaded source media is immutable. Store original blobs separately from project/timeline metadata; all edits reference source asset IDs and use source ranges, transforms, and effects.
- Editing is non-destructive. Do not overwrite, transcode in place, or delete uploaded source bytes during an edit.
- Programmatic and future AI edits must become validated, typed editing operations with a project ID and expected timeline version. Agents do not directly rewrite video files or application state.
- Provider-specific behaviour belongs behind capability-reporting provider adapters. Do not couple timeline, project, or UI contracts to a vendor SDK.
- Long-running operations (analysis, proxies, transcription, generation, and final render) belong in asynchronous jobs/workers. A browser timer or application request is not a production job queue.
- Browser IndexedDB in this stage is a local workspace implementation, not a substitute for authenticated server-side workspaces, server backups, object storage, or collaboration.

# Development requirements

- Never bypass JSON Schema validation for project data, timelines, or agent-generated commands. Keep the schemas in `schemas/` aligned with TypeScript contracts and regression tests.
- Reject commands for stale timeline versions and validate operation-specific arguments before applying them.
- Never add provider API keys to source code, project JSON, prompts, asset metadata, logs, screenshots, exports, or version history. Never expose secrets to frontend bundles.
- Never run untrusted CLI commands or let an LLM invent shell commands for automatic execution. MCP/CLI tools require a server-side permission boundary and explicit policy.
- Do not mutate source assets. Make derived/proxy/render assets distinct records with provenance.
- Do not silently change project state. User-visible project/timeline mutations need undo/redo, immutable checkpoints/version comparison capability, and an audit record with actor, timestamp, command, before/after versions, and affected IDs.
- Every generation must create a job; every generated asset must record provider/model/input provenance. Generation and render work must be idempotent and retryable before production claims are made.
- Every provider adapter must declare capabilities; callers must consult the registry instead of assuming a model supports a feature.
- Rights and consent checks fail closed. Public availability is not consent or commercial authorization. Character tools require documented subject rights and consent. Block uncertain-age/underage people from adult workflows; non-consensual intimate deepfakes are never allowed.
- High-cost actions require budget limits and approval. External publishing requires explicit permission or a previously approved automation. Never imply rights, safety guarantees, or vendor capabilities without evidence.
- Add regression tests for editing commands, migrations, validation, permissions, and safety-critical behaviour. Preserve existing project files when adding schema fields and implement a migration before changing persisted formats.
- Preserve the established React entry point and styling foundation. Use React hooks only in components/custom hooks and keep source changes within existing app conventions.
- Use `bun` scripts for local checks. `bun run typecheck` is the frontend TypeScript check; `bun test` runs deterministic command tests.
- Do not claim production authentication, team roles, resumable cloud uploads, malware scanning, FFprobe/proxy worker processing, asynchronous jobs, or authoritative MP4 rendering unless those services are implemented and verified.

# Agent behaviour

- Prefer deterministic tools. Use generation only when generation is actually required.
- Before destructive, rights-sensitive, or expensive operations, calculate impact, preview changes where possible, and require approval according to policy.
- Read the provider capability registry before routing provider work. Never assume a provider feature or commercial usage right exists.
- Validate untrusted file type claims against file bytes; report actual media-processing limits rather than calling browser metadata extraction a complete FFprobe analysis.
- Keep long-running work out of main-thread request/interaction paths. Save checkpoints early, verify the user-visible workflow, and report any incomplete acceptance criteria plainly.
- Make the smallest change that supports the current stage. Do not create empty placeholder files merely to match a proposed directory tree.
