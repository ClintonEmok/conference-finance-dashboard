<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

After changing Convex code, run both `npx convex codegen` and `npx convex dev --once` before wrapping up.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Workflow & Deployment Conventions

- **Branches:** `main` is the canonical integration branch. The repo also tracks `master`; after merging into `main`, mirror the result:
  `git push origin main:master`
- **Deployment:**
  - Frontend auto-deploys to https://conference.dclm-nl.org via Vercel (project `conference-finance-dashboard`) on pushes to the production branch.
  - Convex production deployment: https://grateful-pelican-605.convex.cloud (project `conference-finance-dashboard`, team `clintonneemok11`).
  - Push Convex functions with `npx convex deploy` (or the Vercel build command `npx convex deploy --cmd 'npm run build'` once wired).
  - Manage production Convex env vars with `npx convex env set NAME 'value' --prod` / `npx convex env list --prod`.
- **Environment-variable rules:**
  - `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` MUST be set on the Convex production runtime (not just Vercel) — email templates render inside Convex actions and use them for the logo URL and booking links.
  - `SIGNUP_SUBMISSION_SECRET` must be identical on BOTH the Vercel/Next runtime AND the Convex runtime whenever the signup token gate is enabled.
- **Keep operator-gated (do NOT automate):** the production legacy backfill and the announcement broadcast — see `docs/production-deployment-runbook.md`.
