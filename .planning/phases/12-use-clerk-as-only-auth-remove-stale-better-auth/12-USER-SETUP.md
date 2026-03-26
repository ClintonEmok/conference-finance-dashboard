# Phase 12: User Setup Required

**Generated:** 2026-03-26
**Phase:** 12-use-clerk-as-only-auth-remove-stale-better-auth
**Status:** Incomplete

Complete these items for Clerk-only authentication to function. The agent automated everything possible; these items require human access to Clerk and Convex dashboards.

## Environment Variables

| Status | Variable                            | Source                                          | Add to                                 |
| ------ | ----------------------------------- | ----------------------------------------------- | -------------------------------------- |
| [ ]    | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys                      | `.env.local`                           |
| [ ]    | `CLERK_SECRET_KEY`                  | Clerk Dashboard → API Keys                      | `.env.local`                           |
| [ ]    | `CLERK_JWT_ISSUER_DOMAIN`           | Clerk Dashboard → JWT Templates / issuer domain | `.env.local` and Convex deployment env |

## Dashboard Configuration

- [ ] **Create or verify the Clerk JWT template/audience named `convex`**
  - Location: Clerk Dashboard → JWT Templates
  - Set to: Audience `convex`
  - Notes: Convex checks this value against `applicationID: "convex"`.

- [ ] **Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex deployment**
  - Location: Convex Dashboard → Environment Variables
  - Set to: Your Clerk JWT issuer domain
  - Notes: Convex uses this issuer to validate Clerk-issued tokens.

## Verification

After completing setup, verify with:

```bash
npm run typecheck
```

Expected results:

- TypeScript passes with the Clerk/Convex auth bridge in place.
- Signed-in Clerk sessions can mint `convex` tokens for Convex requests once the dashboard values are configured.

---

**Once all items complete:** Mark status as "Complete" at top of file.
