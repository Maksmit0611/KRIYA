# KRIYA agent brain: implementation and free setup

## What is implemented

KRIYA now has a working offline knowledge assistant and an optional hosted language-model path. It uses retrieval-augmented context, not model training. More relevant, licensed knowledge is useful; indiscriminate bulk data is not a substitute for a good model or measured retrieval.

| Layer | Implementation | Operational boundary |
| --- | --- | --- |
| Frontend | React editor plus Agent workspace: Overview, Knowledge, Skills, Memory and Edit preview | Existing local editor remains usable without an account |
| Brain | Groq API adapter using `openai/gpt-oss-20b`, configured in `data/agent/providers.json` | Requires an owner-supplied free-plan API key and live Convex |
| Offline fallback | Deterministic weighted keyword retrieval | Always available; not a language model, no API request |
| Knowledge | 30 original editing guidance records + 15 acquired CC0 Wikidata definitions | Source links, licenses, revisions and hashes included; no video bytes downloaded |
| Private knowledge | JSON import, delete, scoped retrieval in Convex | Up to 100 records per user/workspace, 20 per import, 2,000 characters per record |
| Memory | Explicit add/forget notes in localStorage or Convex | Local notes are a reference brief; cloud notes are supplied to cloud reasoning; no automatic conversation retention |
| Skills/tools | JSON registry, knowledge retrieval, numerical project inspection, supported edit proposals | No arbitrary shell, URL fetching, MCP execution or external publishing |
| Database/backend | Convex checkpoint, memory, private knowledge, quota and activity tables; authenticated queries/mutations/actions | Code and in-memory tests pass; real deployment/auth/model calls need owner configuration |
| Design | JSON tokens and sections, responsive cards, actual timeline SVG chart, activity list, highlights and reduced-motion-aware animation | Chart values come from project state; activity comes from real recorded cloud runs |

The hosted request assembles current question + top four relevant knowledge records + explicit cloud notes + numerical project summary. It makes one bounded model call and validates the JSON reply. This is controlled orchestration, not an open-ended autonomous tool loop. It cannot see frames, hear audio, render, transcribe or generate media. The model may suggest split/delete/duplicate/speed, but a separate local preview and explicit Apply edit are still required. Project/version/selection guards remain enforced by the editor.

## Free model choice and alternatives (researched 16 October 2026)

The implemented adapter uses Groq's hosted OpenAI open-weight GPT-OSS 20B model, so model inference runs outside your MacBook. Groq lists the model in its supported catalog and Free-plan limits. Actual limits depend on your organization and can change; check the console. The local app additionally caps calls to 20 per user/day and 3 per minute, and 50 per deployment/day and 6 per minute. Failed attempts consume quota. No automatic retries or paid fallback exist.

| Option | Suitability | Key or limitation |
| --- | --- | --- |
| Groq Free plan | Implemented: fast hosted text reasoning, no local GPU | Free API key required; keep account on Free plan; provider quotas apply |
| Gemini Developer API free tier | Alternative for a later provider adapter | Separate Google AI Studio key; model-specific quotas/eligibility; free-tier content can be used to improve products |
| Browser/local open models | Possible later offline LLM alternative | Weights and inference consume local memory/compute; not chosen for your cloud preference |
| Freebuff included models | Useful to build and maintain the repository | Its coding-agent access is not an unrestricted inference API key for KRIYA's visitors |

Groq's paid-price column is not a promise of free access; its Free-plan limits are a separate account setting. `GROQ_FREE_PLAN_CONFIRMED=true` is an owner acknowledgment, not a billing API check. KRIYA cannot prove that a supplied key belongs to a free account. Do not enable billing or substitute paid credentials if you require zero spend. Convex, Clerk and frontend hosts also have finite free-plan limits. The implementation does not register paid services or download model weights.

Sources: [Groq models](https://console.groq.com/docs/models), [Groq free limits](https://console.groq.com/docs/rate-limits), [Groq data handling](https://console.groq.com/docs/your-data), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Freebuff](https://github.com/CodebuffAI/freebuff).

## Required owner configuration

First complete [CLOUD-DEVELOPMENT.md](CLOUD-DEVELOPMENT.md): free Convex cloud deployment, Clerk development app with Organizations, JWT template named `convex`, audience `convex`, workspaceId from `{{org.id}}`, matching issuer and both public frontend values.

Then configure these **only in the Convex deployment environment**:

| Variable | Value/source |
| --- | --- |
| `GROQ_API_KEY` | Create a key in your own [Groq console](https://console.groq.com/keys) on the Free plan; never use a `VITE_` prefix |
| `GROQ_FREE_PLAN_CONFIRMED` | `true` after checking the account has not been upgraded to paid billing |
| `AGENT_ALLOWED_SUBJECTS` | Comma-separated Clerk user IDs allowed to run cloud reasoning (for example your own user ID); no browser-controlled allowlist |
| `CLERK_JWT_ISSUER_DOMAIN` | Same Clerk development app's issuer, as described in the cloud guide |

Run `bun install --frozen-lockfile`, `bun run convex:dev` (choose cloud development), then `bun run convex:check` when the environment is ready. Restart/rebuild the frontend after changing `VITE_CLERK_PUBLISHABLE_KEY` or `VITE_CONVEX_URL`. Sign in and choose an organization. Open Agent, select hosted mode, review the data-use checkbox and explicitly send a question. No real credentials are checked in or needed in chat.

## Feed additional knowledge

The Knowledge tab accepts a JSON array through paste or a `.json` file under 100 KB. Confirm ownership or CC0 licensing; imports are private to the authenticated user within the workspace. Delete entries there to remove them from future retrieval. Example: `data/knowledge/import-example.json`.

Each record contains `title` (1–200 characters), `body` (1–2,000 characters), `tags` (up to 12 short strings), an HTTPS `sourceUrl`, and `license` (`CC0-1.0` or `User-owned`). The source URL is attribution/reference only and is never fetched. Split long material into coherent sections with useful titles rather than filling context with a whole book. Do not put API keys, passwords or third-party private information in knowledge or memory. Private knowledge reaches Groq only when included in a cloud question you explicitly send.

Refresh the public glossary with `bun run data:refresh` (Python 3 required). The script fetches pinned Wikidata entities, records acquisition time/revision/hash, writes atomically and leaves the previous file intact on failure. Initial name-based research produced album/band collisions, which were removed before committing; the refresher uses reviewed entity IDs rather than ambiguous search terms. Review changed definitions before redeployment. Public static JSON ships with the frontend: do not store private documents in the bundled `data/knowledge/` directory.

See [DATA-SOURCES.md](DATA-SOURCES.md) and `data/knowledge/sources.json` for acquisition versus reference-only sources. Video/audio training datasets, bulk scraped tutorials and media files are not bundled. Adding new knowledge changes retrieval, not model weights.

## Privacy, limits and verification

- Cloud memory and imported knowledge use both verified workspace and user scope. Workspace checkpoints remain organization-shared as documented previously. There is no fine-grained organization role system.
- The model request contains no project title, asset filenames, binary media, whole timeline or original source files. Your question, notes and imported text may themselves contain sensitive information: review what you submit.
- Activity stores run metadata, status, provider/model and token counts, not chat text. The latest 100 runs per user/workspace are retained. Crashed calls may remain pending; failed call token totals are unknown and recorded as zero, not measured free usage. Explicit memory/knowledge remains until you delete it. Provider retention is separate from KRIYA storage.
- Model output, retrieved knowledge and notes are untrusted. Structured-output validation and the edit permission boundary constrain actions; they do not guarantee every answer is correct or eliminate all prompt injection.
- Local notes remain in this browser/project and are not silently uploaded. Offline retrieval can search your loaded private knowledge without contacting the model.
- Current retrieval is a bounded keyword scorer, not semantic embeddings, a vector database or fine-tuning. The private-record and request limits deliberately keep the first cloud path small and affordable.

Local validation: `bun run typecheck`, `bun test` (27 tests), and production build. In-memory Convex tests cover auth/config/consent rejection, workspace/user isolation, note delete, atomic knowledge import, quota limits, a mocked complete cloud request and checkpoint conflicts. Provider tests use synthetic responses, never real credentials. Browser QA and actual Clerk/Groq/Convex end-to-end verification are separate and must not be inferred from these tests.

Live acceptance: deploy Convex; verify sign-in and organization claim; add/delete private notes and knowledge; confirm another user/workspace cannot read them; ask one opted-in model question; inspect a completed run; test a supported edit suggestion and stale preview rejection; revoke provider configuration and confirm offline mode remains useful. Do not claim these live checks passed until they do.
