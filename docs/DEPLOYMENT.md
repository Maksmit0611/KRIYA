# Deploy KRIYA without running a server on your laptop

## Hosted frontend result

A private KRIYA frontend was successfully deployed on 16 October 2026: [Open KRIYA Creative Studio](https://kriya-creative-studio-smit.sillytrout257.chatgpt.site). Deployment succeeded through Sites. It includes the offline knowledge assistant, local editor, project charts, local reference memory and edit preview. No Convex/Clerk/Groq values were available for that build; hosted reasoning, private cloud memory/knowledge and cloud checkpoints are not active or verified on this deployment. Browser interaction QA was unavailable in this execution environment; native deployment status confirms hosting, not full end-to-end behavior.

The Site is owner-private. It is a separate hosted frontend copy of the repository; GitHub pushes do not automatically republish it. Use its Sites workflow to publish later changes, or enable the GitHub Pages workflow for repository-driven hosting.

KRIYA has two deployment parts: a static React frontend and a Convex backend. Groq runs the optional model. Keeping those hosted avoids running a model or persistent server on your MacBook. Media editing/preview still uses browser resources.

## Freebuff path

Freebuff can edit this GitHub repository, run build/test commands and provide its supported hosted deployment workflow. Its published project describes Web/Cloud hosted environments and deployment workflows; those features do not remove the need for KRIYA's Convex/Clerk/Groq account configuration. Its included coding models are not an API credential for KRIYA.

Open/import `Maksmit0611/KRIYA` in Freebuff and use the repo's instructions, not a rewritten app:

1. Read `AGENTS.md`, `docs/AGENT-BRAIN.md` and `docs/CLOUD-DEVELOPMENT.md`.
2. Install with `bun install --frozen-lockfile`; run `bun run typecheck`, `bun test`, `bun run build`.
3. Set the two public frontend build variables through the environment UI. Keep all provider/deploy secrets outside source and outside `VITE_` variables.
4. Deploy the static `dist/` output using Freebuff's available publish workflow. Use root `BASE_PATH=/` for a root-domain site; use the appropriate subpath otherwise. A preview sandbox is not proof of a durable production URL.
5. Authenticate the Convex CLI with your own account and deploy the cloud backend separately. Configure the issuer, Groq key/free-plan acknowledgment and allowed Clerk subjects there. Complete the live acceptance checklist.

Source: [Freebuff project](https://github.com/CodebuffAI/freebuff).

## Other hosting choices

| Host | What it hosts | Configuration |
| --- | --- | --- |
| GitHub Pages | Static frontend | Existing `.github/workflows/pages.yml`; repository Settings → Pages → Source: GitHub Actions. Public-repo free hosting limits apply. Set the public frontend variables in Actions Variables |
| Cloudflare Pages | Static frontend | Connect GitHub; build `bun run build`; output `dist`; `BASE_PATH=/`; two public frontend build variables. Keep external Convex backend |
| ChatGPT Sites | A private hosted frontend in this workspace | Same built React assets; optional Convex/Groq still requires owner configuration. Site identity and publishing are managed separately from GitHub |
| Convex cloud Free plan | Authenticated backend/database and model action | `bun run convex:dev` / `bun run convex:check`; not a general static web frontend host in this setup |

A public commercial application should check the frontend host's terms and service limits before launch. Free tiers are quota-limited; the code cannot guarantee zero spend after an account is upgraded to billing.

## Existing Pages failure

The latest main-branch run inspected before these changes was `38230905552`: the repository's prior merge message records successful build/artifact checks but a Pages 404 because Pages was not enabled. The GitHub connector cannot change repository administration settings. Enable Pages via repository Settings → Pages and rerun the workflow; there is no need to buy hosting for this frontend. Never paste a broad personal access token into the application to solve this.

[GitHub Pages configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/).
