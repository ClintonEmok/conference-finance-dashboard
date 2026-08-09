/**
 * Fail-closed preview-deployment guard shared by the legacy preview write
 * mutations (`backfillLegacyAccommodationPreferences` + `seedPreviewSimulation`).
 *
 * Pure and dependency-free: no Convex, no network. The detected deployment
 * identity is read ONLY from the trusted runtime environment
 * (`CONVEX_SITE_URL`) and compared — in canonical exact-match form — against
 * an explicitly allowed deployment URL (the `allowedDeploymentUrl` argument,
 * falling back to the `PREVIEW_DEPLOYMENT_URL` environment variable). There is
 * no prefix/suffix matching and no "skip when unset" path: an unavailable
 * deployment identity or allowlist fails closed BEFORE the caller can read or
 * write anything.
 *
 * Contract:
 * - `preview: true` is the mandatory explicit write-authorization marker
 *   (`PREVIEW_REQUIRED` otherwise).
 * - The detected deployment identity MUST be available; an absent
 *   `CONVEX_SITE_URL` throws `DEPLOYMENT_UNKNOWN` instead of skipping the
 *   check.
 * - An allowed deployment MUST be configured; when neither the argument nor
 *   `PREVIEW_DEPLOYMENT_URL` provides one, the call throws
 *   `ALLOWLIST_UNAVAILABLE`.
 * - Both values are normalized to a canonical form (trimmed, at most one
 *   trailing "/", `dev:<name>` resolved to `https://<name>.convex.site`) and
 *   compared with strict equality. A selector that cannot be resolved to an
 *   exact URL (e.g. `prod:<name>`) throws `DEPLOYMENT_SELECTOR_UNRESOLVABLE`.
 *   Any mismatch throws `WRONG_DEPLOYMENT`.
 * - Production execution is therefore only possible when an operator
 *   explicitly passes the exact production deployment URL as the allowed
 *   deployment (documented gate B in docs/production-deployment-runbook.md).
 */

/**
 * Canonical form of a deployment URL/selector for exact-match comparison:
 * trimmed, at most one trailing "/" stripped, and `dev:<name>` selectors
 * resolved to `https://<name>.convex.site`. A selector that cannot be
 * resolved to an exact URL throws (fail closed).
 */
export function normalizeDeploymentUrl(value: string): string {
  let normalized = value.trim()
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1)
  }
  const selector = /^(dev|prod):(.+)$/.exec(normalized)
  if (selector) {
    const kind = selector[1]
    const name = selector[2]
    if (kind === "dev") {
      return `https://${name}.convex.site`
    }
    // `prod:<name>` cannot be resolved to an exact deployment URL here — the
    // production URL shape is operator-supplied, so fail closed.
    throw new Error(
      `DEPLOYMENT_SELECTOR_UNRESOLVABLE: Cannot resolve deployment selector '${normalized}' to an exact URL; refusing to run a preview write.`
    )
  }
  return normalized
}

/**
 * Assert that a preview write is authorized to run on the detected deployment.
 * Throws on any failure BEFORE the caller can read or write a database row.
 */
export function assertPreviewDeployment(input: {
  preview: boolean
  allowedDeploymentUrl?: string
  operation: "backfill" | "seed"
}): void {
  const { preview, allowedDeploymentUrl, operation } = input

  if (preview !== true) {
    throw new Error(
      `PREVIEW_REQUIRED: This ${operation} is preview-only and requires \`preview: true\`.`
    )
  }

  const detected = process.env.CONVEX_SITE_URL?.trim()
  if (!detected) {
    throw new Error(
      "DEPLOYMENT_UNKNOWN: Detected deployment identity is unavailable; refusing to run a preview write."
    )
  }

  const allowedRaw =
    allowedDeploymentUrl?.trim() || process.env.PREVIEW_DEPLOYMENT_URL?.trim()
  if (!allowedRaw) {
    throw new Error(
      "ALLOWLIST_UNAVAILABLE: No allowed deployment URL is configured; refusing to run a preview write."
    )
  }

  const detectedNormalized = normalizeDeploymentUrl(detected)
  const allowedNormalized = normalizeDeploymentUrl(allowedRaw)

  if (detectedNormalized !== allowedNormalized) {
    throw new Error(
      `WRONG_DEPLOYMENT: Detected deployment '${detectedNormalized}' does not match the allowed preview deployment '${allowedNormalized}'.`
    )
  }
}
