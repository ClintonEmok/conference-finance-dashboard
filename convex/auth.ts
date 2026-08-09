import type {
  MutationCtx,
  QueryCtx,
  ActionCtx,
} from "./_generated/server"
import type { UserIdentity } from "convex/server"

/**
 * Asserts that the caller is authenticated.
 * Throws "Unauthorized" if no identity is present.
 * Returns the UserIdentity for downstream use.
 */
export async function requireIdentity(ctx: ActionCtx): Promise<UserIdentity>
export async function requireIdentity(
  ctx: MutationCtx | QueryCtx
): Promise<UserIdentity>
export async function requireIdentity(
  ctx: MutationCtx | QueryCtx | ActionCtx
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Unauthorized")
  }
  return identity
}
