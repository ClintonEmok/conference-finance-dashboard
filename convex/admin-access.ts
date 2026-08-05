import type { MutationCtx, QueryCtx } from "./_generated/server"
import { requireIdentity } from "./auth"

/**
 * Server-side administrator boundary for the Phase 41 accommodation admin
 * APIs (Upgrades & Options tab).
 *
 * The browser route being event-scoped is NOT an authorization boundary: any
 * authenticated Convex client could otherwise call these functions directly
 * with arbitrary event/order IDs. Every Phase 41 admin query/mutation must
 * therefore resolve the caller from the authenticated identity (never from a
 * client-supplied user ID) and assert administrator membership before reading
 * or writing anything.
 *
 * The v5.0 data model has no `users.role` field yet, so the admin boundary is
 * an explicit allowlist keyed by the authenticated Clerk identity:
 *   - `tokenIdentifier` (the canonical stable Convex identity key,
 *     e.g. `https://<clerk-domain>|user_2...`) — the primary source.
 *   - `email` (the Clerk primary email, lowercased) — a readable secondary
 *     source for deployments that prefer email-based provisioning.
 *
 * Production deployments MUST seed the real administrator identifiers into
 * one of the two sets below (the seeded `admin@example.com` value only exists
 * so the convex-test suites exercise the real check path). A later phase may
 * replace this allowlist with a `users.role`-backed check.
 */
export const ADMIN_TOKEN_IDENTIFIERS: ReadonlySet<string> = new Set([
  // Seed real Clerk token identifiers here, e.g.
  // "https://your-clerk-domain.clerk.accounts.dev|user_2abcdef123"
])

export const ADMIN_EMAILS: ReadonlySet<string> = new Set([
  // Test/seed admin used by the convex-test suites. Real deployments add
  // their administrator emails here or to ADMIN_TOKEN_IDENTIFIERS.
  "admin@example.com",
])

export function isAdminIdentity(identity: {
  tokenIdentifier?: string
  email?: string | null
}): boolean {
  const email = identity.email?.toLowerCase()
  const hasAdminEmail =
    email !== undefined && email !== "" && ADMIN_EMAILS.has(email)
  const hasAdminToken =
    identity.tokenIdentifier !== undefined &&
    ADMIN_TOKEN_IDENTIFIERS.has(identity.tokenIdentifier)
  return hasAdminEmail || hasAdminToken
}

/**
 * Asserts that the caller is authenticated AND an administrator.
 * Throws "Admin access required" for an authenticated non-admin and
 * "Unauthorized" for an anonymous caller. Returns the UserIdentity for
 * downstream use.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await requireIdentity(ctx)
  if (!isAdminIdentity(identity)) {
    throw new Error("Admin access required")
  }
  return identity
}
