import { v } from "convex/values"
import { internalMutation, type MutationCtx } from "./_generated/server"
import {
  buildFamilyPreviewSnapshot,
  buildLegacyPreviewSnapshot,
  LEGACY_EVENT_SLUG,
  SEED_ORDER,
  remapLogicalReferences,
  stableKeyFor,
  type PreviewSnapshot,
} from "../lib/domain/legacy/preview-simulation"
import { assertPreviewDeployment } from "../lib/domain/legacy/preview-deployment-guard"

/**
 * RUN-01 preview production simulation seed. Private, preview-only,
 * idempotent `internalMutation` that seeds the sanitized audited
 * `divine-redesign` shape (51 orders / 116 attendees / 160 slots / 84 rooms /
 * 2 hotels, partitioned 38/72 no-selection and 13/44 legacy-assignment) into
 * the DEV/PREVIEW deployment. The additive `families` scope adds realistic
 * family-placement cases to that event without changing the audited counts.
 * Run with:
 *
 *   npx convex run seedPreviewSimulation \
 *     '{"scope":"full","preview":true,"allowedDeploymentUrl":"https://acoustic-tiger-876.convex.site"}'
 *
 * Add family-placement datapoints with:
 *
 *   npx convex run seedPreviewSimulation \
 *     '{"scope":"families","preview":true,"allowedDeploymentUrl":"https://acoustic-tiger-876.convex.site"}'
 *
 * Safety (shared preview-deployment guard):
 * - Requires `preview: true` AND an exactly-matching, explicitly allowed
 *   deployment URL (`allowedDeploymentUrl` or `PREVIEW_DEPLOYMENT_URL`),
 *   compared to the detected `CONVEX_SITE_URL` in canonical form — no
 *   prefix/suffix matching. Rejected BEFORE any database read or write, and
 *   fails closed when the deployment identity or allowlist is unavailable.
 * - Idempotent by stable keys (event slug, booking ref, attendee key, codes,
 *   labels, slot labels), so a `tracer` seed can expand to `full` and a
 *   re-run is a no-op. Never overwrites a row, never writes payments/totals,
 *   never creates physical assignments, never touches another event.
 * - A production write is only possible when an operator explicitly passes
 *   the exact production deployment URL as the allowed deployment.
 */

const TABLE_LIMIT = 2000

/**
 * Bounded literal query of one seeded table. Literal table names are required
 * so the read resolves against the correct table in every runtime/test
 * harness (a dynamic string query is not reliable).
 */
async function loadTableDocs(
  ctx: MutationCtx,
  table: string
): Promise<Array<Record<string, unknown>>> {
  switch (table) {
    case "events":
      return (await ctx.db.query("events").take(TABLE_LIMIT)) as unknown as Array<
        Record<string, unknown>
      >
    case "accommodationCategories":
      return (await ctx.db
        .query("accommodationCategories")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "accommodationOptions":
      return (await ctx.db
        .query("accommodationOptions")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "accommodationRoomTypes":
      return (await ctx.db
        .query("accommodationRoomTypes")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "accommodationHotels":
      return (await ctx.db
        .query("accommodationHotels")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "accommodationEventHotels":
      return (await ctx.db
        .query("accommodationEventHotels")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "accommodationRooms":
      return (await ctx.db
        .query("accommodationRooms")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "accommodationSlots":
      return (await ctx.db
        .query("accommodationSlots")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "eventAccommodationConfig":
      return (await ctx.db
        .query("eventAccommodationConfig")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "eventAccommodationRates":
      return (await ctx.db
        .query("eventAccommodationRates")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "eventAccommodationOptions":
      return (await ctx.db
        .query("eventAccommodationOptions")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "eventAccommodationResources":
      return (await ctx.db
        .query("eventAccommodationResources")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "ticketTypes":
      return (await ctx.db
        .query("ticketTypes")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "orders":
      return (await ctx.db
        .query("orders")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "orderAttendees":
      return (await ctx.db
        .query("orderAttendees")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "orderTicketSelections":
      return (await ctx.db
        .query("orderTicketSelections")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "orderAssignments":
      return (await ctx.db
        .query("orderAssignments")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "orderAccommodationSelections":
      return (await ctx.db
        .query("orderAccommodationSelections")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "attendeeFamilyGroups":
      return (await ctx.db
        .query("attendeeFamilyGroups")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    case "attendeeFamilyMembers":
      return (await ctx.db
        .query("attendeeFamilyMembers")
        .take(TABLE_LIMIT)) as unknown as Array<Record<string, unknown>>
    default:
      return []
  }
}

function sliceToTracerScope(snapshot: PreviewSnapshot): PreviewSnapshot {
  // order_38 is a no-selection order with exactly ONE attendee (the audited
  // 72-attendee population distributes 1 attendee to orders 35-38).
  const keepOrderId = new Set(["order_38"])
  const attendeeIds = new Set<string>()
  for (const row of snapshot.orderAttendees ?? []) {
    if (row.orderId === "order_38") {
      attendeeIds.add(String(row._id))
    }
  }
  return {
    ...snapshot,
    orders: (snapshot.orders ?? []).filter((row) =>
      keepOrderId.has(String(row._id))
    ),
    orderAttendees: (snapshot.orderAttendees ?? []).filter((row) =>
      keepOrderId.has(String(row.orderId))
    ),
    orderTicketSelections: (snapshot.orderTicketSelections ?? []).filter(
      (row) => keepOrderId.has(String(row.orderId))
    ),
    orderAssignments: (snapshot.orderAssignments ?? []).filter((row) =>
      attendeeIds.has(String(row.attendeeId))
    ),
    orderAccommodationSelections: (
      snapshot.orderAccommodationSelections ?? []
    ).filter((row) => attendeeIds.has(String(row.attendeeId))),
  }
}

export default internalMutation({
  args: {
    /** Seed scope: tracer, audited legacy shape, or family datapoints. */
    scope: v.union(
      v.literal("tracer"),
      v.literal("full"),
      v.literal("families")
    ),
    /** Explicit preview-only authorization marker (required). */
    preview: v.boolean(),
    /** Allowed preview deployment URL/selector for the deployment guard. */
    allowedDeploymentUrl: v.optional(v.string()),
    /** Event slug; defaults to the production divine-redesign. */
    slug: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.optional(v.string()),
    slug: v.string(),
    scope: v.union(
      v.literal("tracer"),
      v.literal("full"),
      v.literal("families")
    ),
    alreadySeeded: v.boolean(),
    insertedByTable: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    // Deployment guard: shared fail-closed check runs BEFORE any database
    // read/write. Requires `preview: true` and an exactly-matching, explicitly
    // allowed deployment URL against the detected CONVEX_SITE_URL.
    assertPreviewDeployment({
      preview: args.preview,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "seed",
    })

    const slug = args.slug?.trim() || LEGACY_EVENT_SLUG

    const snapshot =
      args.scope === "tracer"
        ? sliceToTracerScope(buildLegacyPreviewSnapshot())
        : args.scope === "families"
          ? buildFamilyPreviewSnapshot()
          : buildLegacyPreviewSnapshot()

    const idMap = new Map<string, string>()
    const logicalByReal = new Map<string, string>()
    const insertedByTable: Record<string, number> = {}
    // D-06 (Phase 62): every production insert of an `orderAttendees` row must
    // write `eventId` in the same mutation. This seed inserts through a
    // dynamic table name, so the copy cannot be added as a literal field on a
    // literal insert; it is derived from the already-mapped order instead
    // (orders are seeded before their attendees by SEED_ORDER). The event copy
    // remains part of the write contract for compatibility, even though the
    // event-scoped ledger resolves ownership through the order.
    const eventIdByRealOrderId = new Map<string, string>()

    // Precompute logical ID by stable key across the snapshot so that when an
    // existing (already-seeded) row is found by its stable key, its real ID is
    // recorded in the idMap and later rows can remap references to it (this is
    // what lets a tracer seed expand to full without leaking logical IDs).
    const logicalIdByKey = new Map<string, string>()
    for (const { table } of SEED_ORDER) {
      for (const row of snapshot[table] ?? []) {
        const key = stableKeyFor(table, row)
        if (key) {
          logicalIdByKey.set(key, String(row._id))
        }
      }
    }

    const refFieldsByTable = new Map(SEED_ORDER.map((entry) => [entry.table, entry.refs]))

    for (const { table, refs } of SEED_ORDER) {
      const rows = snapshot[table] ?? []
      const existing = new Set<string>()
      const existingDocs = await loadTableDocs(ctx, table)
      for (const doc of existingDocs) {
        // Build the doc's stable key in LOGICAL space so it compares against
        // the snapshot's keys: map the doc's real-ID reference fields back to
        // logical IDs via logicalByReal (parents are scanned before children,
        // so parent real IDs are already known).
        const docRecord = { ...(doc as Record<string, unknown>) }
        for (const ref of refs) {
          const value = docRecord[ref]
          if (typeof value === "string") {
            const logical = logicalByReal.get(value)
            if (logical) {
              docRecord[ref] = logical
            }
          }
        }
        const key = stableKeyFor(table, docRecord)
        if (key) {
          existing.add(key)
          const logicalId = logicalIdByKey.get(key)
          if (logicalId) {
            const realId = String((doc as { _id: string })._id)
            idMap.set(logicalId, realId)
            logicalByReal.set(realId, logicalId)
          }
        }
        if (table === "orders") {
          const realOrderId = String((doc as { _id: string })._id)
          const realEventId = (doc as { eventId?: unknown }).eventId
          if (typeof realEventId === "string") {
            eventIdByRealOrderId.set(realOrderId, realEventId)
          }
        }
      }
      let inserted = 0
      for (const row of rows) {
        const key = stableKeyFor(table, row)
        if (key && existing.has(key)) {
          continue
        }
        const insertRow = remapLogicalReferences(row, refs, idMap)
        if (table === "orderAttendees") {
          const mappedOrderId =
            typeof insertRow.orderId === "string" ? insertRow.orderId : null
          const mappedEventId = mappedOrderId
            ? eventIdByRealOrderId.get(mappedOrderId)
            : undefined
          if (!mappedEventId) {
            throw new Error(
              "Seed preview: an orderAttendees row could not resolve its order's eventId; refusing to insert a legacy-shaped attendee row."
            )
          }
          insertRow.eventId = mappedEventId
        }
        const realId = await ctx.db.insert(
          table as never,
          insertRow as never
        )
        if (table === "orders" && typeof insertRow.eventId === "string") {
          eventIdByRealOrderId.set(String(realId), insertRow.eventId)
        }
        idMap.set(String(row._id), String(realId))
        logicalByReal.set(String(realId), String(row._id))
        if (key) {
          existing.add(key)
        }
        inserted += 1
      }
      insertedByTable[table] = inserted
    }

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()

    return {
      eventId: event ? String(event._id) : undefined,
      slug,
      scope: args.scope,
      alreadySeeded:
        (args.scope === "full" || args.scope === "families") &&
        Object.values(insertedByTable).every((count) => count === 0),
      insertedByTable,
    }
  },
})
