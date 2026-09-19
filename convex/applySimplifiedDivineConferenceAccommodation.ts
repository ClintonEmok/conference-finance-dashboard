import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"

/**
 * Guarded, idempotent production migration for the `divine-redesign`
 * accommodation cutover — Steps 0 and 1 (locked tickets + event
 * configuration/catalog). Run with:
 *
 *   npx convex run applySimplifiedDivineConferenceAccommodation \
 *     --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}'
 *
 * Step 0 (tickets): strictly identifies the four non-`Single Room` entry
 * tickets in their existing deterministic sort/creation order, renames them
 * to `under 3`, `3-11`, `12-17`, and `18+` at €0/€125/€150/€250, keeps
 * `Single Room` at €350, sets every entry ticket to the existing `Double
 * Room` anchor (and `Single Room` to the existing `Single Room` anchor), and
 * marks every entry ticket `accommodationIncluded: true`. The migration fails
 * closed when the expected ticket/anchor population is ambiguous.
 *
 * Step 1 (configuration/catalog): upserts the three catalog categories, the
 * ten locked room types, the two Standard and two Superior per-person/night
 * rates, the Standard default stay config (check-in equal to the event start,
 * two-night stay), and the enabled `superior_upgrade` and `cot` event options
 * (catalog definitions created if missing; the cot reuses an existing event
 * price and the established €10 default when created). The existing `Double
 * Room` and `Single Room` anchors are patched to the Standard category
 * without creating physical rooms for them.
 *
 * Safety:
 * - The production-deployment guard runs BEFORE any database read/write:
 *   `authorize: true` plus an exactly-matching, explicitly allowed production
 *   deployment URL against the detected `CONVEX_SITE_URL` (deployment-slug
 *   equality; `.convex.cloud` and `.convex.site` are the same identity).
 * - Every write is a stable-key upsert/patch; a duplicate conflicting row for
 *   a stable key fails closed instead of multiplying rows.
 * - Never touches orders, assignments, payments, or accommodation inventory
 *   (resources, hotels, rooms, slots). Re-running is a full no-op.
 */

const DEFAULT_SLUG = "divine-redesign"

const DAY_MS = 24 * 60 * 60 * 1000

const SINGLE_ROOM_TICKET_LABEL = "Single Room"
const SINGLE_ROOM_TICKET_PRICE_MINOR = 35000

const DOUBLE_ROOM_ANCHOR_LABEL = "Double Room"
const SINGLE_ROOM_ANCHOR_LABEL = "Single Room"

const SUPERIOR_UPGRADE_OPTION_KEY = "superior_upgrade"
const COT_OPTION_KEY = "cot"
const SUPERIOR_UPGRADE_PRICE_MINOR = 1000
const DEFAULT_COT_PRICE_MINOR = 1000

const STANDARD_RATES = [
  { occupancy: "single" as const, pricePerPersonMinor: 9000 },
  { occupancy: "shared" as const, pricePerPersonMinor: 6000 },
]
const SUPERIOR_RATES = [
  { occupancy: "single" as const, pricePerPersonMinor: 10000 },
  { occupancy: "shared" as const, pricePerPersonMinor: 7000 },
]

// Canonical catalog definitions — labels/descriptions/sort order match
// `convex/init.ts` (the migration re-applies them so the event converges to
// the locked contract even when the seed has not run on a deployment).
const LOCKED_CATEGORIES = [
  {
    code: "standard" as const,
    label: "Standard",
    description:
      "Standard rooms with the essential amenities. Choose single occupancy for a room to yourself, or shared to share with another attendee.",
    sortOrder: 0,
  },
  {
    code: "superior" as const,
    label: "Superior",
    description:
      "Superior rooms with upgraded comfort and amenities. Chosen directly as a room category.",
    sortOrder: 1,
  },
  {
    code: "family" as const,
    label: "Family",
    description:
      "Family rooms with three beds for families or groups staying together. Pricing to be configured per event.",
    sortOrder: 2,
  },
]

const LOCKED_OPTIONS = [
  {
    code: COT_OPTION_KEY,
    label: "Cot",
    description:
      "Add a cot for a child, charged per night. Choose how many cots and how many nights.",
    kind: "addon" as const,
    unit: "per_night" as const,
  },
  {
    code: SUPERIOR_UPGRADE_OPTION_KEY,
    label: "Superior upgrade",
    description:
      "Upgrade the included stay to Superior rooms, charged per person per night for exactly the included base nights.",
    kind: "upgrade" as const,
    unit: "per_night" as const,
  },
]

const LOCKED_ROOM_TYPES = [
  {
    label: "Standard Single",
    defaultCapacity: 1,
    count: 95,
    description: "Single bed in a standard room. One attendee per room.",
    categoryCode: "standard" as const,
  },
  {
    label: "Standard Double King",
    defaultCapacity: 2,
    count: 61,
    description:
      "One king-size bed in a standard room. Shared by two attendees (e.g. a couple).",
    categoryCode: "standard" as const,
  },
  {
    label: "Standard Double Queen",
    defaultCapacity: 2,
    count: 29,
    description:
      "One queen-size bed (160 cm) in a standard room. Shared by two attendees.",
    categoryCode: "standard" as const,
  },
  {
    label: "Standard Double Twin",
    defaultCapacity: 2,
    count: 60,
    description:
      "Two twin beds placed together in a standard room. Shared by two attendees.",
    categoryCode: "standard" as const,
  },
  {
    label: "Standard Twin (separate beds)",
    defaultCapacity: 2,
    count: 21,
    description:
      "Two twin beds in separate positions in a standard room. Shared by two attendees who prefer separate beds.",
    categoryCode: "standard" as const,
  },
  {
    label: "Superior Single",
    defaultCapacity: 1,
    count: 15,
    description: "Single bed in a superior room. One attendee per room.",
    categoryCode: "superior" as const,
  },
  {
    label: "Superior Double King",
    defaultCapacity: 2,
    count: 33,
    description:
      "One king-size bed in a superior room. Shared by two attendees.",
    categoryCode: "superior" as const,
  },
  {
    label: "Superior Double Twin",
    defaultCapacity: 2,
    count: 50,
    description:
      "Two twin beds in a superior room. Shared by two attendees.",
    categoryCode: "superior" as const,
  },
  {
    label: "Family Room Double King",
    defaultCapacity: 3,
    count: 4,
    description:
      "Three beds in a family room (one king plus an extra bed). Fits a family or group of three.",
    categoryCode: "family" as const,
  },
  {
    label: "Family Room Double Twin",
    defaultCapacity: 3,
    count: 6,
    description:
      "Three beds in a larger family room (twin plus extra bed). Fits a family or group of three.",
    categoryCode: "family" as const,
  },
]

/**
 * Returns the single row of a bounded stable-key read, failing closed on
 * duplicate conflicting rows (the caller must never multiply rows silently).
 */
function firstUnique<T>(rows: Array<T>, subject: string): T | null {
  if (rows.length > 1) {
    throw new Error(
      `DUPLICATE_ROW: Expected at most one ${subject}, found ${rows.length}; refusing to migrate ambiguous rows.`
    )
  }
  return rows[0] ?? null
}

function sortTickets(tickets: Array<Doc<"ticketTypes">>) {
  return tickets
    .slice()
    .sort((a, b) => {
      const aSort = a.sortOrder ?? a._creationTime
      const bSort = b.sortOrder ?? b._creationTime
      if (aSort !== bSort) {
        return aSort - bSort
      }
      return a.label.localeCompare(b.label)
    })
}

export default internalMutation({
  args: {
    /** Event slug to migrate; defaults to the production divine-redesign. */
    slug: v.optional(v.string()),
    /** Explicit production write-authorization marker (required). */
    authorize: v.boolean(),
    /** Allowed production deployment URL for the deployment guard. */
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.string(),
    slug: v.string(),
    entryTicketsRenamed: v.number(),
    entryTicketsPriced: v.number(),
    ticketsAnchored: v.number(),
    ticketsIncluded: v.number(),
    singleRoomTicketPriced: v.number(),
    categoriesCreated: v.number(),
    categoriesUpdated: v.number(),
    roomTypesCreated: v.number(),
    roomTypesUpdated: v.number(),
    anchorsPatched: v.number(),
    ratesCreated: v.number(),
    ratesUpdated: v.number(),
    configCreated: v.number(),
    configUpdated: v.number(),
    catalogOptionsCreated: v.number(),
    eventOptionsEnabled: v.number(),
    eventOptionPricesUpdated: v.number(),
  }),
  handler: async (ctx, args) => {
    // Production-deployment guard: shared fail-closed check runs BEFORE any
    // database read/write. Requires `authorize: true` and an exactly-matching,
    // explicitly allowed production deployment URL against the detected
    // CONVEX_SITE_URL (deployment-slug equality).
    assertProductionDeployment({
      authorize: args.authorize,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "Step 0/1 accommodation migration",
    })

    const slug = args.slug?.trim() || DEFAULT_SLUG

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()
    if (!event) {
      throw new Error(`Event with slug '${slug}' not found`)
    }

    // ---------------------------------------------------------------------
    // Step 0: locked entry tickets.
    // ---------------------------------------------------------------------
    const tickets = sortTickets(
      await ctx.db
        .query("ticketTypes")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(100)
    )
    const singleRoomTickets = tickets.filter(
      (ticket) => ticket.label === SINGLE_ROOM_TICKET_LABEL
    )
    const entryTickets = tickets.filter(
      (ticket) => ticket.label !== SINGLE_ROOM_TICKET_LABEL
    )
    if (singleRoomTickets.length !== 1 || entryTickets.length !== 4) {
      throw new Error(
        `TICKET_POPULATION_AMBIGUOUS: Expected exactly one '${SINGLE_ROOM_TICKET_LABEL}' ticket and four entry tickets for '${slug}', found ${singleRoomTickets.length} single-room and ${entryTickets.length} entry tickets.`
      )
    }

    const doubleRoomAnchor = firstUnique(
      await ctx.db
        .query("accommodationRoomTypes")
        .withIndex("label", (q) => q.eq("label", DOUBLE_ROOM_ANCHOR_LABEL))
        .take(2),
      `room anchor '${DOUBLE_ROOM_ANCHOR_LABEL}'`
    )
    const singleRoomAnchor = firstUnique(
      await ctx.db
        .query("accommodationRoomTypes")
        .withIndex("label", (q) => q.eq("label", SINGLE_ROOM_ANCHOR_LABEL))
        .take(2),
      `room anchor '${SINGLE_ROOM_ANCHOR_LABEL}'`
    )
    if (!doubleRoomAnchor || !singleRoomAnchor) {
      throw new Error(
        `TICKET_POPULATION_AMBIGUOUS: Missing '${DOUBLE_ROOM_ANCHOR_LABEL}' or '${SINGLE_ROOM_ANCHOR_LABEL}' room anchor for '${slug}'.`
      )
    }

    // Age-band ticket contract: map each entry ticket by its CURRENT label so
    // the migration converges from the original synced labels OR an
    // already-updated state. It can never scramble the age bands by relying on
    // creation/sort order (production's synced rows are not age-ordered).
    const AGE_BAND_TICKETS: Record<
      string,
      { label: string; priceMinor: number }
    > = {
      // Original synced labels.
      "0-4": { label: "under 3", priceMinor: 0 },
      "5-12": { label: "3-11", priceMinor: 12500 },
      "13-17": { label: "12-17", priceMinor: 15000 },
      "18+": { label: "18+", priceMinor: 25000 },
      // Already-migrated labels (idempotent re-runs).
      "under 3": { label: "under 3", priceMinor: 0 },
      "3-11": { label: "3-11", priceMinor: 12500 },
      "12-17": { label: "12-17", priceMinor: 15000 },
    }

    let entryTicketsRenamed = 0
    let entryTicketsPriced = 0
    let ticketsAnchored = 0
    let ticketsIncluded = 0
    for (const ticket of entryTickets) {
      const target = AGE_BAND_TICKETS[ticket.label]
      if (!target) {
        throw new Error(
          `TICKET_POPULATION_AMBIGUOUS: Entry ticket '${ticket.label}' is not a known age band for '${slug}'.`
        )
      }
      const patch: {
        label?: string
        priceMinor?: number
        roomTypeId?: Id<"accommodationRoomTypes">
        accommodationIncluded?: boolean
      } = {}
      if (ticket.label !== target.label) {
        patch.label = target.label
        entryTicketsRenamed += 1
      }
      if (ticket.priceMinor !== target.priceMinor) {
        patch.priceMinor = target.priceMinor
        entryTicketsPriced += 1
      }
      if (String(ticket.roomTypeId ?? "") !== String(doubleRoomAnchor._id)) {
        patch.roomTypeId = doubleRoomAnchor._id
        ticketsAnchored += 1
      }
      if (ticket.accommodationIncluded !== true) {
        patch.accommodationIncluded = true
        ticketsIncluded += 1
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("ticketTypes", ticket._id, patch)
      }
    }

    const singleRoomTicket = singleRoomTickets[0]
    const singleRoomPatch: {
      priceMinor?: number
      roomTypeId?: Id<"accommodationRoomTypes">
      accommodationIncluded?: boolean
    } = {}
    if (singleRoomTicket.priceMinor !== SINGLE_ROOM_TICKET_PRICE_MINOR) {
      singleRoomPatch.priceMinor = SINGLE_ROOM_TICKET_PRICE_MINOR
    }
    if (
      String(singleRoomTicket.roomTypeId ?? "") !== String(singleRoomAnchor._id)
    ) {
      singleRoomPatch.roomTypeId = singleRoomAnchor._id
      ticketsAnchored += 1
    }
    if (singleRoomTicket.accommodationIncluded !== true) {
      singleRoomPatch.accommodationIncluded = true
      ticketsIncluded += 1
    }
    if (Object.keys(singleRoomPatch).length > 0) {
      await ctx.db.patch("ticketTypes", singleRoomTicket._id, singleRoomPatch)
    }
    const singleRoomTicketPriced = Object.keys(singleRoomPatch).includes(
      "priceMinor"
    )
      ? 1
      : 0

    // ---------------------------------------------------------------------
    // Step 1: categories, room types, anchors, rates, config, options.
    // ---------------------------------------------------------------------
    let categoriesCreated = 0
    let categoriesUpdated = 0
    const categoryIdByCode = new Map<
      string,
      Id<"accommodationCategories">
    >()
    for (const category of LOCKED_CATEGORIES) {
      const existing = firstUnique(
        await ctx.db
          .query("accommodationCategories")
          .withIndex("by_code", (q) => q.eq("code", category.code))
          .take(2),
        `category '${category.code}'`
      )
      if (existing) {
        if (
          existing.label !== category.label ||
          existing.description !== category.description ||
          existing.sortOrder !== category.sortOrder
        ) {
          await ctx.db.patch("accommodationCategories", existing._id, {
            label: category.label,
            description: category.description,
            sortOrder: category.sortOrder,
          })
          categoriesUpdated += 1
        }
        categoryIdByCode.set(category.code, existing._id)
      } else {
        const id = await ctx.db.insert("accommodationCategories", {
          code: category.code,
          label: category.label,
          description: category.description,
          sortOrder: category.sortOrder,
        })
        categoryIdByCode.set(category.code, id)
        categoriesCreated += 1
      }
    }

    const standardCategoryId = categoryIdByCode.get("standard")
    if (!standardCategoryId) {
      throw new Error("CONFIG_REQUIRED: Standard category is unavailable.")
    }

    let roomTypesCreated = 0
    let roomTypesUpdated = 0
    const roomTypeIdByLabel = new Map<string, Id<"accommodationRoomTypes">>()
    for (const roomType of LOCKED_ROOM_TYPES) {
      const categoryId = categoryIdByCode.get(roomType.categoryCode)
      if (!categoryId) {
        throw new Error(
          `Missing category for room type ${roomType.label}`
        )
      }
      const existing = firstUnique(
        await ctx.db
          .query("accommodationRoomTypes")
          .withIndex("label", (q) => q.eq("label", roomType.label))
          .take(2),
        `room type '${roomType.label}'`
      )
      if (existing) {
        if (
          existing.defaultCapacity !== roomType.defaultCapacity ||
          existing.count !== roomType.count ||
          existing.description !== roomType.description ||
          String(existing.categoryId ?? "") !== String(categoryId)
        ) {
          await ctx.db.patch("accommodationRoomTypes", existing._id, {
            defaultCapacity: roomType.defaultCapacity,
            count: roomType.count,
            description: roomType.description,
            categoryId,
          })
          roomTypesUpdated += 1
        }
        roomTypeIdByLabel.set(roomType.label, existing._id)
      } else {
        const id = await ctx.db.insert("accommodationRoomTypes", {
          label: roomType.label,
          defaultCapacity: roomType.defaultCapacity,
          count: roomType.count,
          description: roomType.description,
          categoryId,
        })
        roomTypeIdByLabel.set(roomType.label, id)
        roomTypesCreated += 1
      }
    }

    // Patch the existing Double Room / Single Room anchors to the Standard
    // category (no physical rooms are created for them).
    let anchorsPatched = 0
    for (const anchor of [doubleRoomAnchor, singleRoomAnchor]) {
      if (String(anchor.categoryId ?? "") !== String(standardCategoryId)) {
        await ctx.db.patch("accommodationRoomTypes", anchor._id, {
          categoryId: standardCategoryId,
        })
        anchorsPatched += 1
      }
    }

    let ratesCreated = 0
    let ratesUpdated = 0
    for (const [categoryCode, rates] of [
      ["standard", STANDARD_RATES],
      ["superior", SUPERIOR_RATES],
    ] as const) {
      const categoryId = categoryIdByCode.get(categoryCode)
      if (!categoryId) {
        throw new Error(`Missing category for ${categoryCode} rates`)
      }
      for (const rate of rates) {
        const existing = firstUnique(
          await ctx.db
            .query("eventAccommodationRates")
            .withIndex("by_eventId_and_categoryId_and_occupancy", (q) =>
              q
                .eq("eventId", event._id)
                .eq("categoryId", categoryId)
                .eq("occupancy", rate.occupancy)
            )
            .take(2),
          `rate ${categoryCode}/${rate.occupancy}`
        )
        if (existing) {
          if (existing.pricePerPersonMinor !== rate.pricePerPersonMinor) {
            await ctx.db.patch("eventAccommodationRates", existing._id, {
              pricePerPersonMinor: rate.pricePerPersonMinor,
            })
            ratesUpdated += 1
          }
        } else {
          await ctx.db.insert("eventAccommodationRates", {
            eventId: event._id,
            categoryId,
            occupancy: rate.occupancy,
            pricePerPersonMinor: rate.pricePerPersonMinor,
          })
          ratesCreated += 1
        }
      }
    }

    const lockedConfig = {
      baseCheckInAt: event.startsAt,
      baseCheckOutAt: event.startsAt + 2 * DAY_MS,
      allowExtendedStayBefore: false,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      defaultCategoryId: standardCategoryId,
      breakfastIncluded: true,
      nightCount: 2,
      updatedAt: Date.now(),
    }
    let configCreated = 0
    let configUpdated = 0
    const configRow = firstUnique(
      await ctx.db
        .query("eventAccommodationConfig")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(2),
      `config for event '${slug}'`
    )
    if (configRow) {
      const differs =
        configRow.baseCheckInAt !== lockedConfig.baseCheckInAt ||
        configRow.baseCheckOutAt !== lockedConfig.baseCheckOutAt ||
        configRow.allowExtendedStayBefore !==
          lockedConfig.allowExtendedStayBefore ||
        configRow.allowExtendedStayAfter !==
          lockedConfig.allowExtendedStayAfter ||
        configRow.allowExtendedStayBoth !==
          lockedConfig.allowExtendedStayBoth ||
        String(configRow.defaultCategoryId ?? "") !==
          String(lockedConfig.defaultCategoryId) ||
        configRow.breakfastIncluded !== lockedConfig.breakfastIncluded ||
        configRow.nightCount !== lockedConfig.nightCount
      if (differs) {
        await ctx.db.patch("eventAccommodationConfig", configRow._id, {
          ...lockedConfig,
        })
        configUpdated = 1
      }
    } else {
      await ctx.db.insert("eventAccommodationConfig", {
        eventId: event._id,
        ...lockedConfig,
      })
      configCreated = 1
    }

    // Catalog option definitions + enabled event options. The superior
    // upgrade is locked at €10/person/night; the cot reuses an existing event
    // price when present and the established €10 default when created.
    let catalogOptionsCreated = 0
    let eventOptionsEnabled = 0
    let eventOptionPricesUpdated = 0
    const optionIdByCode = new Map<string, Id<"accommodationOptions">>()
    for (const option of LOCKED_OPTIONS) {
      const existing = firstUnique(
        await ctx.db
          .query("accommodationOptions")
          .withIndex("by_code", (q) => q.eq("code", option.code))
          .take(2),
        `option '${option.code}'`
      )
      if (existing) {
        optionIdByCode.set(option.code, existing._id)
      } else {
        const id = await ctx.db.insert("accommodationOptions", {
          code: option.code,
          label: option.label,
          description: option.description,
          kind: option.kind,
          unit: option.unit,
        })
        optionIdByCode.set(option.code, id)
        catalogOptionsCreated += 1
      }
    }

    const eventOptions: Array<{
      code: string
      lockedPriceMinor: number | null
    }> = [
      { code: SUPERIOR_UPGRADE_OPTION_KEY, lockedPriceMinor: SUPERIOR_UPGRADE_PRICE_MINOR },
      { code: COT_OPTION_KEY, lockedPriceMinor: null },
    ]
    for (const { code, lockedPriceMinor } of eventOptions) {
      const optionId = optionIdByCode.get(code)
      if (!optionId) {
        throw new Error(`Missing catalog option '${code}'`)
      }
      const existing = firstUnique(
        await ctx.db
          .query("eventAccommodationOptions")
          .withIndex("by_eventId_and_optionId", (q) =>
            q.eq("eventId", event._id).eq("optionId", optionId)
          )
          .take(2),
        `event option '${code}'`
      )
      if (!existing) {
        await ctx.db.insert("eventAccommodationOptions", {
          eventId: event._id,
          optionId,
          enabled: true,
          priceMinor: lockedPriceMinor ?? DEFAULT_COT_PRICE_MINOR,
        })
        eventOptionsEnabled += 1
      } else {
        if (existing.enabled !== true) {
          await ctx.db.patch("eventAccommodationOptions", existing._id, {
            enabled: true,
          })
          eventOptionsEnabled += 1
        }
        if (
          lockedPriceMinor !== null &&
          existing.priceMinor !== lockedPriceMinor
        ) {
          await ctx.db.patch("eventAccommodationOptions", existing._id, {
            priceMinor: lockedPriceMinor,
          })
          eventOptionPricesUpdated += 1
        }
      }
    }

    return {
      eventId: String(event._id),
      slug,
      entryTicketsRenamed,
      entryTicketsPriced,
      ticketsAnchored,
      ticketsIncluded,
      singleRoomTicketPriced,
      categoriesCreated,
      categoriesUpdated,
      roomTypesCreated,
      roomTypesUpdated,
      anchorsPatched,
      ratesCreated,
      ratesUpdated,
      configCreated,
      configUpdated,
      catalogOptionsCreated,
      eventOptionsEnabled,
      eventOptionPricesUpdated,
    }
  },
})
