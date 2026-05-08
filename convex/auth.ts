import type { MutationCtx, QueryCtx } from "./_generated/server"

/**
 * Asserts that the caller is authenticated.
 * Throws "Unauthorized" if no identity is present.
 * Returns the UserIdentity for downstream use.
 */
export async function requireIdentity(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Unauthorized")
  }
  return identity
}
