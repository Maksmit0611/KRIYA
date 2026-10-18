# KRIYA's free brain: an implementable strategy

This is the recommended answer to the question: how can KRIYA use a capable
agent without paying to run every visitor's ChatGPT, Claude, Gemini or Grok
session?

## Product modes

| Mode | Who can use it | Reasoning and editing | Who supplies inference |
| --- | --- | --- | --- |
| Offline editor and assistant | Every visitor | Project inspection, licensed knowledge retrieval and validated edit proposals with preview/approval | None; deterministic KRIYA code in the browser |
| Hosted KRIYA brain | Authenticated owner/allowlisted testers initially | One bounded Groq call using small retrieved context; proposals pass the same edit validator | Owner's Groq Free account, through server-only Convex action |
| Use my own assistant | Visitor whose chosen assistant supports the workflow | Export a structured editing brief and reviewable edit proposal; later connect authenticated KRIYA tools over MCP where the client's plan permits | Visitor's own ChatGPT/Claude/Gemini/Grok product, subject to that product's access rules |
| Optional browser model | User explicitly enables it on a compatible device | Small local model for private/low-cost text assistance | Visitor's device and a model download; never the default on a low-resource device |

The first two modes are partly implemented. The offline assistant and
preview/approval path work locally. The Groq action exists but requires a real
Convex deployment, Clerk sign-in and organization claim, the owner allowlist,
and a server-side Groq Free key. Live deployment/auth/model verification is
still outstanding. The third and fourth modes are design recommendations,
not shipped features.

## Exact initial routing rule

1. Show the editor, local knowledge and edit tools immediately. Never require
   account creation for local work.
2. For a cloud question, require a signed-in, active Clerk organization and
   explicit consent to send the question, selected project summary, relevant
   knowledge and confirmed memory notes. Keep the Groq key in Convex only.
3. For development, keep `AGENT_ALLOWED_SUBJECTS` owner/tester allowlist.
   Before opening hosted reasoning to other visitors, implement and test a
   separate controlled rollout: per-user and deployment-wide quotas, abuse
   throttling, provider status, workspace isolation and a clear capacity
   message. Do not simply remove the allowlist.
4. Limit each request to one small model call with no autonomous retries or
   hidden extra agents. Use structured output; validate and preview a proposed
   edit, then ask the user to apply it. Reject stale timeline versions.
5. On quota exhaustion, missing configuration or provider failure, keep the
   local editor and knowledge assistant working. Do not switch silently to a
   billed provider.

Current code caps Groq calls at 20 per user/day, three per user/minute,
50 per deployment/day and six per deployment/minute. These are KRIYA's own
limits, not a promise of provider capacity. Groq lists free limits for
`openai/gpt-oss-20b` at the organization level; the owner's dashboard has
the authoritative account limits. A free API account has finite capacity,
so it cannot power unlimited visitors.

## Portable assistant route

The cheapest way to let users involve their preferred assistant is a
versioned **KRIYA Edit Brief** export containing a minimal project summary,
goal, constraints, selected clip IDs/ranges, available skills and a JSON Schema
for proposed edit commands. The user can take that brief to their assistant
and import a returned command proposal into KRIYA. KRIYA validates it, shows
the timeline diff, and requires approval before applying. Never export source
video bytes or private memory silently.

Later, expose the same operations as an authenticated remote MCP server:

- `project_summary` and `knowledge_search`: scoped, read-only.
- `propose_edit`: returns a typed command and preview; no mutation.
- `apply_approved_edit`: only after KRIYA has issued a short-lived approval
  bound to user, workspace, project, command hash and timeline version. This
  needs a complete auth/authorization and replay-protection design before
  exposure; starting with read-only tools is safer.

MCP is an interoperability layer, not a universal free API license. Client
availability differs. In particular, current ChatGPT custom full MCP write
support is limited by plan/workspace permissions; do not advertise universal
one-click editing from every consumer account. A JSON brief export works even
when the user's assistant cannot connect to MCP.

## Optional alternatives and their tradeoffs

- **Cloudflare Workers AI:** a 10,000-neuron-per-day free allocation currently
  exists. This could provide a second server adapter after its model quality,
  per-request consumption, terms and integration cost are tested. It would
  complicate the existing Convex backend if added solely to chase free quota.
- **Gemini API Free:** usable for selected development use cases, but its Free
  tier says submitted content may be used to improve Google's products.
  Avoid sending private video, customer documents, transcripts or unreviewed
  user data there by default; get explicit consent and recheck the current
  model's quotas and data terms first.
- **WebLLM/Transformers.js:** optional browser-only inference can remove
  shared token cost for a compatible device. It downloads model weights and
  consumes that device's memory/compute, so it does not meet the low-laptop-load
  goal as the default.
- **Visitor's own API key:** possible later, but key storage, rotation, use
  limits, fraud prevention and provider-specific terms need a separate design.
  A consumer chat subscription is not interchangeable with an API key.

Free text inference is distinct from video processing. Automatic transcription,
frame understanding, long renders and video generation need real media workers,
storage and finite compute budgets. In the free-first product, editing source
media stays local and non-destructive; asynchronous cloud video jobs remain a
later verified stage.

## Deployment and owner setup

Deploy the static Vite frontend to Cloudflare Pages or Freebuff. Keep Convex
as the hosted database/action backend, Clerk as auth and Groq as the optional
hosted model. A frontend-only deployment does not activate the cloud brain.
Configure the values listed in [CLOUD-DEVELOPMENT.md](CLOUD-DEVELOPMENT.md) and
[AGENT-BRAIN.md](AGENT-BRAIN.md) in the respective service dashboards. Keep
`GROQ_API_KEY` and deployment credentials out of source and outside all
`VITE_*` variables. Verify sign-in, workspace isolation, one model question,
quota behavior, a proposed edit, stale-version rejection and offline fallback
on the deployed URL before inviting the public.

## References, checked 18 October 2026

- [Groq Free-plan rate limits](https://console.groq.com/docs/rate-limits)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Gemini API pricing and Free-tier data policy](https://ai.google.dev/gemini-api/docs/pricing)
- [WebLLM documentation](https://webllm.mlc.ai/docs/)
- [ChatGPT custom MCP server availability](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
- [Claude MCP](https://docs.anthropic.com/en/docs/mcp)
- [Gemini remote MCP tools](https://ai.google.dev/gemini-api/docs/function-calling)
- [Grok custom MCP connectors](https://docs.x.ai/grok/connectors)
