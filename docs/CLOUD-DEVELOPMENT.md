# Free development cloud checkpoints

## Audit and scope

At base commit `c635793`, the requirements document described `src/convex/projects.ts`, guards, auth config and mounted providers that were absent from main. Clerk and Convex were dependencies only. This change implements the smallest metadata checkpoint flow; it does not deploy or claim a verified live service.

- `convex.json` points CLI discovery at `src/convex/`.
- Clerk wraps ConvexProviderWithClerk only when both frontend values exist. With no values the editor remains local-only.
- Sign-in, organization creation/selection and sign-out are exposed in the editor header. Requests wait for Convex authentication, not merely Clerk sign-in.
- `projects:get` and `projects:save` require a verified `workspaceId` organization claim. Neither accepts a caller-selected workspace argument. Every lookup includes the authenticated workspace and project ID.
- JSON Schema and project/timeline/asset reference validation run on the server. Saves are atomic compare-and-swap operations using a server revision independent of timeline versions (renames also change metadata).
- Check cloud downloads existing metadata for review and records its revision. Save checkpoint explicitly replaces that revision. Concurrent changes are rejected; check cloud again before retrying.
- Saving scopes a copy of local metadata to the active organization. It does not change the local project or upload any original media. Metadata may include filenames, prompts, rights IDs and audit history: review before saving to a shared organization.
- All members with the verified organization claim can read/write this development workspace. Granular team roles, live collaboration, cloud restore/import, project discovery and media storage are not implemented. Checkpoints are limited to 750 KB UTF-8 including history; export locally if too large. Each project stores its latest checkpoint only.

## Values the owner must configure

| Value | Location | Source |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | ignored `.env.local`, or frontend build environment | Clerk development app API keys, `pk_test_…` |
| `VITE_CONVEX_URL` | same frontend environment | matching Convex cloud development deployment URL |
| `CONVEX_DEPLOYMENT` | ignored `.env.local`, CLI only | written by Convex setup, typically `dev:…` |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex deployment environment | same Clerk app's Frontend API URL, full `https://…` issuer |

The first two are public bundled configuration, not secrets. No Clerk secret key or provider key is needed. Authenticate the Convex CLI using your own account; do not commit its credentials or paste tokens into chat. No real values are included in this change.

## Development setup

1. Create/select a free Clerk development application. Enable Organizations and allow your development users to create or join an organization. Create a JWT template named exactly `convex` (Convex preset), retain Clerk's standard issuer and subject, and set these template claims:

   ```json
   {
     "aud": "convex",
     "workspaceId": "{{org.id}}"
   }
   ```

   The workspace must come from Clerk's active organization, never user-editable metadata. Without an active organization cloud requests fail closed. If using Clerk's newer native Convex integration instead, ensure its issued token actually carries the same audience and workspaceId claim; do not assume default claims match this application.

2. Run `bun install --frozen-lockfile`. Copy `.env.example` to ignored `.env.local` and fill the public Clerk key. Run `bun run convex:dev`, sign in when prompted, and explicitly choose a **cloud development** deployment rather than local or production. CLI setup writes the deployment selector and URL. If the initial push reports missing issuer, set `CLERK_JWT_ISSUER_DOMAIN` on that deployment in the Convex dashboard, then rerun. Confirm `VITE_CONVEX_URL` targets this same deployment.
3. Keep `bun run convex:dev` running for backend sync/codegen, or run `bun run convex:check` for a one-time dev push. `bun run convex:codegen` refreshes generated bindings but is not a substitute for deploying functions/auth config. This implementation uses explicit typed function references and generic server builders so local typecheck works before account setup; generated files are not hand-authored.
4. Run `bun run dev`. Sign in, create/select an organization, then **Check cloud** and **Save checkpoint**. If auth never becomes ready, inspect the issuer, audience, template name and active organization. Do not log JWTs.
5. For the existing GitHub Pages frontend, set repository Actions **variables** `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL`, then rerun the Pages workflow. Vite reads these at build time. Configure Clerk's allowed development origins/redirects for your actual frontend URL. Pages hosts only the frontend; deploy Convex separately first. No backend deploy credential belongs in Pages variables or its bundle.

## Verification and acceptance record

Local verification for this change: `bun install --frozen-lockfile`, `bun run typecheck`, `bun test` (18 passing tests, including actual Convex handlers in convex-test), and `bun run build` passed. Vite reports a bundle size warning above 500 KB; no build errors. Convex-test is an in-memory backend and does not verify live JWT signatures. Run these checks again before deployment. These verify local code, not a live identity provider or database. Complete this table after owner configuration; record dates/results without token contents.

| Live check | Expected result | Current result |
| --- | --- | --- |
| `bun run convex:check` | functions, schema and auth configuration sync to selected dev deployment | Unverified: owner deployment required |
| Sign in and select organization | Convex authenticates; cloud buttons enabled | Unverified |
| Signed-out direct get/save | backend rejects request | Unverified |
| Signed-in user without active organization | request rejected for missing workspace claim | Unverified |
| Check empty project, save | revision 1; database row has verified org scope and actor | Unverified |
| Check cloud after reload | downloaded manifest matches saved project/timeline/assets | Unverified |
| Rename project, save again | revision advances despite unchanged timeline version | Unverified |
| Two tabs check same revision, first saves, second saves | second save rejected; first row preserved | Unverified |
| Switch organization or user | prior revision forgotten; other workspace cannot retrieve prior row by project ID | Unverified |
| Switch back to first organization | original checkpoint still retrievable | Unverified |
| No frontend env values | local editor, local autosave and offline assistant still work | Manual browser verification pending |

Downloaded manifests contain metadata only. Opening the app on another device will not restore source media or automatically load the checkpoint. Keep original files backed up.

References: [Convex Clerk integration](https://docs.convex.dev/auth/clerk), [Convex CLI](https://docs.convex.dev/cli), [Clerk JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates).
