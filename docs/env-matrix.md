# Environment Variable Matrix

Canonical ownership of every environment variable: **where each value MUST be set** so the deployed app, Convex runtime, and emails work correctly. Use this when adding or changing a variable.

Legend:
- **Vercel (build)** = set as a Vercel project env var with the `production`/`preview` target; read during `next build`.
- **Vercel (runtime)** = read by Next.js server code at runtime (API routes, server components).
- **Convex (runtime)** = read inside Convex functions (`convex/`) — set with `npx convex env set NAME 'value' --prod`.
- **Both** = the value MUST be identical on both runtimes.

| Variable | Vercel (build) | Vercel (runtime) | Convex (runtime) | Notes |
| --- | :-: | :-: | :-: | --- |
| `NEXT_PUBLIC_CONVEX_URL` | ✅ | — | — | Browser + Next-server Convex client. Also injected by `convex deploy` at build time. |
| `NEXT_PUBLIC_SITE_URL` | ✅ | — | ✅ | Vercel build: layout/sitemap/robots. **Convex runtime: email logo URL** (`lib/email/templates/*`). |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | ✅ | Booking/links in emails and track-payment permalinks. Must be `https://conference.dclm-nl.org`. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ✅ | — | — | Browser widget (`ReviewSubmitStep`). |
| `TURNSTILE_SECRET_KEY` | — | ✅ | — | `app/api/signup/submit/route.ts`. |
| `SIGNUP_SUBMISSION_SECRET` | — | ✅ | ✅ | **Both**, identical — HMAC for the signup submission token gate (CR-07). Only enforced when present on BOTH. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | — | — | Browser Clerk. (Convex prod also carries a copy; keep consistent.) |
| `CLERK_SECRET_KEY` | — | ✅ | ✅ | Next server (webhooks) + Convex auth. |
| `CLERK_FRONTEND_API_URL` | — | ✅ | ✅ | Clerk instance URL. |
| `CLERK_JWT_ISSUER_DOMAIN` | — | ✅ | ✅ | Convex `convex/auth.config.ts` issuer (must be the Clerk custom domain). |
| `RESEND_API_KEY` | — | — | ✅ | Email actions (`convex/emailActions.ts`). |
| `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` | — | — | ✅ | Email sender identity. |
| `TIKKIE_API_KEY` / `TIKKIE_APP_TOKEN` / `TIKKIE_BASE_URL` | — | ✅ | ✅ | Tikkie payments. Webhook routes on Next need the secrets at runtime too. |
| `MAGIC_LINK_FROM_EMAIL` | — | — | ✅ | Legacy magic-link sender. |
| `INTEGRATION_PING_TIMEOUT_MS` | — | — | ✅ | Health-check timeout. |
| `CONVEX_DEPLOY_KEY` | ✅ | — | — | Vercel build only. **Production** and **Preview** scopes for `convex deploy`. |

## Rules

1. **Emails render inside Convex actions** — any URL/logo used by `lib/email/templates/*` must be resolvable from the **Convex runtime** env (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`). Setting them only on Vercel breaks email links/logos.
2. **`SIGNUP_SUBMISSION_SECRET` is both-or-neither.** Half-provisioned states fail open (degraded) or closed unexpectedly. Provision both together, then verify (runbook gate A).
3. **Vercel build env vars** are inlined at build time — changing them requires a redeploy.
4. Manage Convex prod env with `npx convex env set NAME 'value' --prod`; inspect with `npx convex env list --prod`.
