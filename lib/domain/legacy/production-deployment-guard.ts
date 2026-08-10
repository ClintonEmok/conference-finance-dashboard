/**
 * Fail-closed production-deployment guard shared by the guarded production
 * migration mutations (`applySimplifiedDivineConferenceAccommodation`,
 * `backfillLegacyAccommodationPreferences`, and
 * `applyKoningshofAccommodationInventory`).
 *
 * Pure and dependency-free: no Convex, no network. The detected deployment
 * identity is read ONLY from the trusted runtime environment
 * (`CONVEX_SITE_URL`) and compared — in canonical deployment-slug form —
 * against an explicitly allowed production deployment URL (the required
 * `allowedDeploymentUrl` argument). There is no prefix/suffix matching, no
 * environment-variable fallback, and no "skip when unset" path: an
 * unavailable deployment identity or allowlist fails closed BEFORE the caller
 * can read or write anything.
 *
 * Contract:
 * - `authorize: true` is the mandatory explicit production write-authorization
 *   marker (`AUTHORIZATION_REQUIRED` otherwise).
 * - The detected deployment identity MUST be available; an absent
 *   `CONVEX_SITE_URL` throws `DEPLOYMENT_UNKNOWN` instead of skipping the
 *   check.
 * - An allowed production deployment MUST be supplied; a missing or empty
 *   `allowedDeploymentUrl` throws `ALLOWLIST_UNAVAILABLE` (there is no
 *   selector or environment fallback).
 * - Both values are normalized to the deployment slug — accepting
 *   `https://{slug}.convex.cloud` and `https://{slug}.convex.site` (with
 *   harmless trailing-slash normalization) as the same identity — and
 *   compared with strict equality. A value that cannot be normalized to an
 *   exact slug throws `INVALID_DEPLOYMENT_URL`; any slug mismatch throws
 *   `WRONG_DEPLOYMENT`.
 * - Production writes are therefore only possible when an operator explicitly
 *   passes `authorize: true` AND the exact production deployment URL as the
 *   allowed deployment (documented gate B in
 *   docs/production-deployment-runbook.md).
 */

/**
 * Canonical deployment slug for exact-match comparison: trims, strips any
 * number of harmless trailing slashes, and accepts `https://{slug}.convex.cloud`
 * or `https://{slug}.convex.site` as the same deployment identity. A value
 * that cannot be resolved to an exact slug throws (fail closed).
 */
export function normalizeDeploymentSlug(value: string): string {
  let normalized = value.trim()
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1)
  }
  const slug = /^https:\/\/([a-zA-Z0-9-]+)\.convex\.(cloud|site)$/.exec(
    normalized
  )
  if (!slug) {
    throw new Error(
      `INVALID_DEPLOYMENT_URL: Cannot normalize '${normalized}' to a convex deployment slug; expected https://{slug}.convex.cloud or https://{slug}.convex.site.`
    )
  }
  return slug[1]
}

/**
 * Assert that a production migration write is authorized to run on the
 * detected deployment. Throws on any failure BEFORE the caller can read or
 * write a database row.
 */
export function assertProductionDeployment(input: {
  authorize: boolean
  allowedDeploymentUrl?: string
  operation: string
}): void {
  const { authorize, allowedDeploymentUrl, operation } = input

  if (authorize !== true) {
    throw new Error(
      `AUTHORIZATION_REQUIRED: This ${operation} is a production migration and requires \`authorize: true\`.`
    )
  }

  const detected = process.env.CONVEX_SITE_URL?.trim()
  if (!detected) {
    throw new Error(
      "DEPLOYMENT_UNKNOWN: Detected deployment identity is unavailable; refusing to run a production migration."
    )
  }

  const allowedRaw = allowedDeploymentUrl?.trim()
  if (!allowedRaw) {
    throw new Error(
      "ALLOWLIST_UNAVAILABLE: No allowed production deployment URL is configured; refusing to run a production migration."
    )
  }

  const detectedSlug = normalizeDeploymentSlug(detected)
  const allowedSlug = normalizeDeploymentSlug(allowedRaw)

  if (detectedSlug !== allowedSlug) {
    throw new Error(
      `WRONG_DEPLOYMENT: Detected deployment slug '${detectedSlug}' does not match the allowed production deployment slug '${allowedSlug}'.`
    )
  }
}
