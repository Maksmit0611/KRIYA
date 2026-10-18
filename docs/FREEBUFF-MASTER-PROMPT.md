# KRIYA: Freebuff master build brief

Paste this brief into Freebuff **after** connecting the existing
[`Maksmit0611/KRIYA`](https://github.com/Maksmit0611/KRIYA) repository. Ask it to
make a branch and pull request; do not let a deployment tool replace `main`
without review.

> You are the principal engineer and product designer for KRIYA, an
> AI-assisted, local-first professional video editor. Work in the existing
> repository; do not scaffold a replacement application. Read `AGENTS.md`,
> `README.md`, `docs/ARCHITECTURE.md`, `docs/AGENT-BRAIN.md`,
> `docs/CLOUD-DEVELOPMENT.md`, `docs/FREE-BRAIN-STRATEGY.md`, and this brief
> before editing anything.
>
> ## Mission
>
> Make KRIYA a trustworthy agent-assisted video-editing workspace. It must be
> useful with no model, no login, and no cloud configuration. When the owner
> opts in, it may use an authenticated cloud brain, durable scoped memory,
> skills, constrained tools, and asynchronous media jobs. It must present an
> elegant, responsive creative-studio UI rather than a generic chatbot.
>
> Build a real product incrementally. Do not claim capabilities that are not
> implemented and verified. In particular, an AI text reply is not a rendered
> video, a browser media preview is not server-side video processing, and a
> sandbox preview is not a production deployment.
>
> ## Non-negotiable engineering rules
>
> 1. Preserve KRIYA's canonical versioned `Project` and `Timeline` data. AI
>    never mutates React state or video bytes directly. All edits are typed,
>    schema-validated commands containing project ID and expected timeline
>    version; show a preview and require explicit user approval before apply.
> 2. Original media is immutable. Never overwrite, transcode in place, or
>    delete it. Derived proxies, transcripts, thumbnails, renders and generated
>    assets are distinct records with provenance.
> 3. No secrets in source, JSON fixtures, prompts, client bundles, logs, Git
>    history, screenshots or PR text. Keys must be server-side deployment
>    secrets; `VITE_*` values are public by design and must never contain a
>    provider key, Clerk secret, or Convex deploy token.
> 4. Do not add arbitrary shell execution, unrestricted URL fetching, browser
>    automation, autonomous publishing, or raw MCP tool access to the model.
>    Every tool needs a server-side permission policy, typed input/output,
>    audit event, time/size limit and an approval boundary.
> 5. Do not imply that ChatGPT Plus, Claude Pro, Gemini consumer plans, or Grok
>    consumer plans are API credentials. They are not a free shared backend for
>    KRIYA visitors. Model providers are optional owner-configured adapters with
>    rate, budget and consent controls.
> 6. Do not bulk-scrape tutorials, copyrighted videos, private data or training
>    data. New knowledge must be user-owned or appropriately licensed, have
>    source/license/revision metadata, be reviewable, and be retrievable by
>    scope. More raw data is not automatically a better brain.
> 7. Keep the app useful while every external service is disconnected. Preserve
>    the offline assistant and local editor paths. Fail closed for rights,
>    consent, auth, paid/provider configuration and destructive operations.
> 8. Use `bun` for project commands. Run `bun run typecheck`, `bun test`, and
>    `bun run build` after each coherent change. Add regression tests for every
>    new policy, schema migration, tool boundary and editing command.
>
> ## Current facts to preserve
>
> - React + Vite frontend; Convex is the backend/database; Clerk supplies
>   optional authentication and organization-scoped workspace identity.
> - Existing offline knowledge retrieval, explicit memory, skill registry,
>   edit-command preview/apply boundary and optional Groq adapter already exist.
> - Cloud deployment/auth/model calls are unverified until the owner supplies
>   their own Clerk, Convex and Groq settings. Never manufacture credentials or
>   mark the live acceptance table as passed without live evidence.
> - The current first model route is Groq Free with `openai/gpt-oss-20b`, only
>   after explicit user consent and strict per-user/deployment quotas. It is
>   intentionally not an unlimited public AI service.
>
> ## Product experience to build
>
> Retain the existing visual language but mature it into a cinematic creative
> studio. The editor remains primary; the agent is a sidecar, not a takeover.
> Use the design tokens in `data/design/system.json` and keep all reusable
> product copy, labels, capabilities and highlights in structured JSON where
> practical. Provide reduced-motion support, keyboard navigation, visible focus
> states, semantic controls, high contrast, concise empty states, responsive
> desktop/tablet/mobile layouts and no gratuitous animation.
>
> In the Agent Studio, present:
>
> - **Brief:** project goal, target platform, audience, style and constraints.
> - **Plan:** a transparent ordered proposal that names the skills/tools it
>   would use, their input, cost/risk, approval state and expected output.
> - **Memory:** explicit user notes and workspace-scoped knowledge; show source,
>   scope, retention and delete controls. Never silently store a whole chat.
> - **Skills:** cards generated from the registry, each with a capability,
>   readiness/configuration status, required approval and audit history.
> - **Activity:** a timeline/audit trail of proposed, approved, completed,
>   rejected and failed work. Never store raw private prompts by default.
> - **Review:** diff-like timeline edit previews, safety/risk annotations,
>   undo/redo and an explicit Apply button.
>
> Charts must be driven by real project/job data, not invented numbers. Use a
> compact timeline duration/track composition view, job queue status and quota
> usage only when those records genuinely exist.
>
> ## Agent architecture
>
> Implement an orchestrator as a bounded state machine, not an unconstrained
> autonomous loop. One user request may produce a plan, call only approved
> skills, validate results, then return a reviewable proposal. The model chooses
> only from a server-provided allowlist of capabilities; deterministic validators
> and permission policies make the final decision.
>
> Define these roles as configuration and capability contracts first:
>
> | Role | Purpose | May do without approval | Requires approval |
> | --- | --- | --- | --- |
> | Director/orchestrator | Turn a brief into a bounded plan | Read scoped project summary | Any write, provider call, or delegated job |
> | Story analyst | Suggest pacing, structure and beat markers | Read approved transcript/metadata | Write markers or edit commands |
> | Timeline editor | Produce validated non-destructive edit proposals | Inspect selected clip/timeline | Apply split, trim, speed, reorder or delete |
> | Caption/transcript worker | Create/review transcript jobs | Inspect permitted media metadata | Upload/transcribe media; publish captions |
> | Visual/audio quality reviewer | Identify technically measurable issues | Read derived analysis | Change timeline, render or publish |
> | Render manager | Enqueue and track render jobs | Inspect approved render preset | Spend quota, start render or export |
> | Librarian | Retrieve/import approved knowledge | Search public and user-owned scoped records | Import, delete or share knowledge |
>
> Do not pretend these are independent sentient employees. They are named,
> auditable bounded workflows. Limit fan-out and concurrency. Persist job state,
> idempotency key, creator, workspace scope, provider/model, inputs by reference,
> output provenance, cost/quota estimate, timestamps and error category. Support
> cancellation and safe retries; long jobs must not run inside a browser timer or
> a single web request.
>
> ## Skills and tools
>
> Evolve `data/agent/skills.json` into a validated registry. Every skill needs
> `id`, `title`, `description`, `category`, `capabilities`, `permission`,
> `risk`, `status`, `inputSchema`, `outputSchema`, `requiresProvider`,
> `requiresConsent`, `auditEventType`, `timeoutMs`, and `version`. Keep JSON
> Schema mirrors in `schemas/`. Start with read-only/project-inspection,
> knowledge retrieval, edit proposal, transcript-job request, render-job
> request, memory management and export request. A skill marked unavailable or
> not configured must render as disabled with a useful setup message.
>
> Tool policy:
>
> - Reads are scoped by authenticated user + workspace and content access.
> - Editing commands require preview approval and expected timeline version.
> - Upload, model inference, transcription, render, export, web share and
>   third-party calls require explicit consent plus an actionable quota/budget
>   check.
> - Publishing has a separate final confirmation. Never let a prompt trigger
>   external publishing automatically.
> - Log structured metadata, not secrets or raw media.
>
> ## Brain, memory and knowledge
>
> Use retrieval-augmented generation, not training/fine-tuning, for the initial
> product. Keep three deliberate memory layers:
>
> 1. **Session working context:** ephemeral plan and selected project summary;
>    cleared/expired predictably.
> 2. **Explicit personal memory:** user-confirmed notes/preferences with edit
>    and delete controls. Default local-only until the user opts into cloud
>    sync.
> 3. **Workspace knowledge:** authenticated, organization-and-user scoped
>    records with title, body, tags, source URL, license, revision/hash,
>    provenance, visibility, created/updated time and retention status.
>
> Retrieval must include only the minimum relevant records, use deterministic
> ranking before a model call, respect scope/consent and show citations in the
> result. Add record size/count/rate limits and import validation. Never mix one
> organization's knowledge with another. Do not automatically use content from
> newly imported files until the user confirms the import.
>
> Build an append-only audit-event model for sensitive actions. It must identify
> actor, workspace, role/skill, requested action, approval decision, target
> references, before/after timeline versions, provider/model when applicable,
> and status. Avoid storing raw prompts by default. Provide data deletion paths
> for memory, knowledge and derived records.
>
> ## Model provider architecture
>
> Keep `data/agent/providers.json` capability-driven. Add a typed server-side
> adapter contract with `health`, `capabilities`, `estimate`, `run`, structured
> error categories and redacted telemetry. The UI must derive choices from the
> registry rather than hard-code a vendor.
> Follow the product modes and routing rules in `docs/FREE-BRAIN-STRATEGY.md`:
> offline for all visitors, allowlisted Groq Free for the first cloud users,
> portable edit-brief export for external assistants, and an optional browser
> model only when the visitor explicitly requests on-device inference.
>
> Implement or document adapters in this order:
>
> 1. **offline:** existing deterministic retrieval and edit-preview path; no key.
> 2. **groq:** existing server-only, Free-plan, rate-limited text-reasoning path.
> 3. **local OpenAI-compatible endpoint (optional):** owner-operated Ollama or
>    equivalent for a private development machine; disabled by default and never
>    exposed as a public unauthenticated proxy.
> 4. **OpenAI, Anthropic, Google Gemini and xAI/Grok:** optional server-only
>    adapter stubs/configuration contracts. Do not activate, call or expose them
>    without owner-provided API keys, provider terms/usage review, per-provider
>    spending/usage limits and acceptance tests. Show `Not configured`, not
>    `Free`.
>
> Never proxy a visitor's consumer ChatGPT/Claude/Gemini/Grok subscription.
> If a future BYO-key mode is designed, encrypt keys at rest or keep them local
> to that user's device, never return them to the browser after submission, and
> make the data-flow and cost owner explicit. Do not build BYO key storage in
> this PR unless its security design, encryption keys, deletion flow and threat
> model are reviewed.
>
> ## Interoperability with ChatGPT, Claude, Gemini and Grok
>
> Design KRIYA as a standalone product with portable, documented contracts, not
> as an unverified claim of native integration everywhere. First publish:
>
> - versioned JSON schemas for projects, edit commands, skills, jobs, audit
>   events, knowledge records and provider capability reports;
> - a small, authenticated MCP-compatible tool surface or an explicit MCP
>   implementation plan, exposing only safe read/propose operations first;
> - import/export of a KRIYA editing brief and reviewable edit proposals;
> - OpenAPI/HTTP documentation for public endpoints only after authentication,
>   rate limits and authorization are implemented.
>
> Do not claim that a remote MCP endpoint will work in ChatGPT, Claude, Gemini
> or Grok until each target's current integration requirements are checked and
> an end-to-end test has passed. Each vendor's connector/distribution approval,
> OAuth flow and policy can differ. Keep vendor-specific integration layers
> isolated from the editor core.
>
> ## Real video editing roadmap
>
> KRIYA currently provides browser-local editing and bounded AI edit proposals.
> Do not claim automatic frame understanding, audio understanding, captioning,
> proxy generation, rendering, generation or final MP4 export until those are
> implemented as jobs with real worker infrastructure. Design the following
> stages but deliver only the first feasible, tested slice in this PR:
>
> - Stage A: local non-destructive timeline operations, project inspection and
>   AI edit proposals (existing foundation).
> - Stage B: authenticated job model, job UI and provider-neutral job contracts.
> - Stage C: opted-in upload object storage, malware/type checking, derived
>   asset provenance and resumable upload design.
> - Stage D: transcription/proxy/render worker with queue, cancellation,
>   idempotency, quota and real output verification.
> - Stage E: provider-backed generation with rights, consent and safety policy.
>
> Rights and consent must fail closed. Never build a workflow for non-consensual
> intimate content, impersonation/deepfakes, or uncertain-age people in adult
> contexts. Do not import other people's media, voices, faces or private docs
> without recorded authority.
>
> ## Free-first deployment topology
>
> Use GitHub as the source of truth. KRIYA consists of separate deployable
> concerns; no host magically supplies all of them for unlimited free:
>
> | Concern | Initial free-first choice | Boundary |
> | --- | --- | --- |
> | Frontend | Cloudflare Pages/Workers or Freebuff deployment | Build static `dist/`; only public `VITE_*` config belongs here |
> | Database/backend/actions | Convex Free development deployment | Holds Clerk issuer, model key, quotas and private state; do not commit values |
> | Authentication | Clerk development application | Organization claim and JWT template must be configured by owner |
> | Default hosted reasoning | Groq Free account | Owner key, quota-limited, explicit consent; no paid fallback |
> | Local alternative | Browser/offline retrieval or owner-run local endpoint | No public proxy to a home machine |
> | Code workspace/preview | Freebuff Cloud | Useful build/deploy surface, not a substitute for configuring the backend |
>
> Prefer Cloudflare for the public frontend if this may become a public product;
> it can retain the free `*.pages.dev` address and later accept a purchased
> custom domain. Vercel Hobby is acceptable for private/personal development,
> but its free plan is restricted to non-commercial personal use, so do not use
> it for a commercial public product without reviewing and accepting the current
> plan terms. Freebuff can import this repository and deploy a preview/hosted
> build; configure Convex/Clerk separately.
>
> Required owner values, supplied only through provider dashboards/CI secret
> management (never ask to paste them into source):
>
> - Frontend public build values: `VITE_CLERK_PUBLISHABLE_KEY`,
>   `VITE_CONVEX_URL`.
> - Convex deployment secrets: `CLERK_JWT_ISSUER_DOMAIN`, `GROQ_API_KEY`,
>   `GROQ_FREE_PLAN_CONFIRMED=true`, `AGENT_ALLOWED_SUBJECTS`.
> - Clerk JWT template: name `convex`, audience `convex`,
>   `workspaceId: {{org.id}}`.
>
> Do not add billing, payment methods, paid fallbacks, a credit card requirement
> or auto-upgrades. Document free-tier limits honestly; free inference/hosting
> quotas can change and must never be treated as unlimited.
>
> ## Work plan and stopping rule
>
> Do not attempt a giant rewrite. Create a short `docs/IMPLEMENTATION-PLAN.md`
> that maps every requested capability to: current state, next smallest testable
> slice, required owner account/value, cost/quota risk, data/privacy risk,
> acceptance test and later phase. Then implement only **Phase 1** below:
>
> 1. Validate and enrich the skills/provider configuration contracts and their
>    JSON Schemas without breaking existing fixtures.
> 2. Add a durable, tested agent-job/audit contract and a visible UI status
>    surface only if the underlying records and operations genuinely work.
> 3. Improve the Agent Studio's Brief → Plan → Review flow using the existing
>    edit preview boundary. Do not invent video-analysis results.
> 4. Update `docs/DEPLOYMENT.md`, `docs/AGENT-BRAIN.md` and `.env.example` with
>    exact secret boundaries, Freebuff, Cloudflare and Vercel deployment paths.
> 5. Add an interoperability/MCP design document; do not expose a public tool
>    endpoint yet unless its auth and authorization tests pass.
>
> At the end of the first PR, stop. Present: a concise change summary, files
> changed, schema/migration impact, commands and results, exact values I still
> must create, unverified live checks, a screenshot/preview link if available,
> and the smallest Phase 2 proposal. Do not deploy production services, enable
> billing, create accounts, rotate keys, force-push, or merge your own PR.
>
> ## Definition of done for the first PR
>
> - Existing local editor and offline brain still work with no environment
>   values.
> - New JSON contracts have matching schemas, validation and regression tests.
> - Agent actions remain scoped, typed, previewable, auditable and approval
>   gated.
> - No secret, token, provider key, personal data or copyrighted bulk dataset is
>   committed.
> - `bun run typecheck`, `bun test` and `bun run build` pass; report actual
>   output and any pre-existing warnings.
> - Documentation tells the truth about what is local, configured, deployed,
>   tested and still unavailable.
>
> Begin by reporting a repository audit and a phased plan. Before changing data
> structures, identify migrations and backwards-compatibility impact. Prefer a
> small correct PR over a large speculative feature dump.

## How to use the brief

1. In Freebuff Cloud, connect the existing GitHub repository; do not start a
   blank default app.
2. Paste the quoted brief above and ask for **a branch plus a pull request**, not
   a direct push to `main`.
3. First accept only the audit/Phase 1 plan. Then let it implement Phase 1 and
   inspect the diff and test output before merging.
4. Deploy the static frontend only after the build is green. Configure Convex,
   Clerk and Groq in their own dashboards; a frontend deploy cannot configure
   those services.

This prompt deliberately rejects the common "one prompt, unlimited free,
fully autonomous video editor" promise. A useful KRIYA is feasible, but it must
be built and verified as secure, scoped stages.
