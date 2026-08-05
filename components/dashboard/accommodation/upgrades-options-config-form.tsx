"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/lib/format"
import { fromDateInputValue, toDateInputValue } from "@/lib/dashboard/accommodation-dates"
import type { Id } from "@/convex/_generated/dataModel"
import {
  useUpsertEventAccommodationAgePricing,
  useUpsertEventAccommodationConfig,
  useUpsertEventAccommodationOption,
  useUpsertEventAccommodationRate,
  useUpsertEventAccommodationResource,
} from "@/lib/convex/hooks/accommodation"

// ---------------------------------------------------------------------------
// Local structural types for the server response. Money, night counts,
// sellable beds, and pending counts are NEVER computed in this component;
// every value below is rendered exactly as Convex returned it.
// ---------------------------------------------------------------------------

type ConfigCategory = {
  _id: Id<"accommodationCategories">
  code: string
  label: string
}

type ConfigRate = {
  _id: Id<"eventAccommodationRates">
  categoryId: Id<"accommodationCategories">
  occupancy: "single" | "shared" | "family"
  pricePerPersonMinor: number
  categoryCode: string | null
  categoryLabel: string | null
}

type ConfigOption = {
  _id: Id<"eventAccommodationOptions">
  optionId: Id<"accommodationOptions">
  enabled: boolean
  priceMinor: number
  eligibilityAgeBandCode: string | null
  optionCode: string | null
  optionLabel: string | null
  kind: string | null
  unit: string | null
}

type ConfigResource = {
  _id: Id<"eventAccommodationResources">
  kind: "room" | "cot"
  roomTypeId?: Id<"accommodationRoomTypes">
  count: number
  roomTypeLabel: string | null
  sellableBeds: number
}

type ConfigAgePricing = {
  _id: Id<"eventAccommodationAgePricing">
  ageBandCode: "under_3" | "3_11" | "12_17" | "18_plus"
  rateType: "free" | "full" | "percent" | "flat"
  value: number
  sortOrder: number
}

type CatalogOption = {
  _id: Id<"accommodationOptions">
  code: string
  label: string
  description?: string
  kind: string
  unit: string
}

type CatalogRoomType = {
  _id: Id<"accommodationRoomTypes">
  label: string
  defaultCapacity: number
  categoryId?: Id<"accommodationCategories">
}

type EventConfigResponse = {
  event: {
    eventId: Id<"events">
    slug: string
    title: string
    startsAt: number
    timezone: string
  }
  config: {
    baseCheckInAt: number
    baseCheckOutAt: number
    allowExtendedStayBefore: boolean
    allowExtendedStayAfter: boolean
    allowExtendedStayBoth: boolean
    breakfastIncluded: boolean
    nightCount: number
    updatedAt: number
  } | null
  activeCategories: ConfigCategory[]
  rates: ConfigRate[]
  options: ConfigOption[]
  resources: ConfigResource[]
  agePricing: ConfigAgePricing[]
  catalogCategories: ConfigCategory[]
  catalogOptions: CatalogOption[]
  catalogRoomTypes: CatalogRoomType[]
}

type CatalogAgeBand = {
  _id: Id<"accommodationAgeBands">
  code: string
  label: string
  minAge: number
  maxAge?: number
}

const OCCUPANCIES = [
  { value: "single", label: "Single" },
  { value: "shared", label: "Shared" },
  { value: "family", label: "Family" },
] as const

const RATE_TYPES: Array<{ value: ConfigAgePricing["rateType"]; label: string }> = [
  { value: "free", label: "Free" },
  { value: "full", label: "Full price" },
  { value: "percent", label: "Percent of rate" },
  { value: "flat", label: "Flat minor units" },
]

function Feedback({
  error,
  success,
}: {
  error: string | null
  success: string | null
}) {
  if (error) {
    return (
      <p role="alert" aria-live="assertive" className="text-sm text-destructive">
        {error}
      </p>
    )
  }
  if (success) {
    return (
      <p
        aria-live="polite"
        className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
      >
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {success}
      </p>
    )
  }
  return null
}

export function UpgradesOptionsConfigForm({
  eventId,
  config,
  catalogAgeBands = [],
}: {
  eventId: Id<"events">
  config: EventConfigResponse
  catalogAgeBands?: CatalogAgeBand[]
}) {
  return (
    <div className="min-w-0 space-y-5">
      <StayConfigSection eventId={eventId} config={config} />
      <RateGridSection eventId={eventId} config={config} />
      <OptionSection eventId={eventId} config={config} />
      <AgePricingSection eventId={eventId} config={config} catalogAgeBands={catalogAgeBands} />
      <AvailabilitySection eventId={eventId} config={config} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stay configuration
// ---------------------------------------------------------------------------

function StayConfigSection({
  eventId,
  config,
}: {
  eventId: Id<"events">
  config: EventConfigResponse
}) {
  const upsert = useUpsertEventAccommodationConfig()
  const row = config.config
  // Stay dates convert in the EVENT timezone (never the browser's local
  // timezone) so an admin outside the event timezone sees and saves the same
  // calendar dates around UTC midnight and DST boundaries.
  const timeZone = config.event?.timezone ?? "UTC"

  const [checkIn, setCheckIn] = useState<string>("")
  const [checkOut, setCheckOut] = useState<string>("")
  const [extendBefore, setExtendBefore] = useState(false)
  const [extendAfter, setExtendAfter] = useState(false)
  const [extendBoth, setExtendBoth] = useState(false)
  const [breakfastIncluded, setBreakfastIncluded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  // Hydrate draft from server values once. `undefined` config is treated as
  // an unconfigured state — never as zero data.
  const serverKey = row?.updatedAt ?? "unconfigured"
  useEffect(() => {
    setCheckIn(row ? toDateInputValue(row.baseCheckInAt, timeZone) : "")
    setCheckOut(row ? toDateInputValue(row.baseCheckOutAt, timeZone) : "")
    setExtendBefore(row?.allowExtendedStayBefore ?? false)
    setExtendAfter(row?.allowExtendedStayAfter ?? false)
    setExtendBoth(row?.allowExtendedStayBoth ?? false)
    setBreakfastIncluded(row?.breakfastIncluded ?? false)
    setError(null)
    setSuccess(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey])

  const save = async () => {
    setError(null)
    setSuccess(null)
    if (!checkIn || !checkOut) {
      setError("Check-in and check-out dates are required.")
      return
    }
    const baseCheckInAt = fromDateInputValue(
      checkIn,
      row?.baseCheckInAt ?? Date.now(),
      timeZone
    )
    const baseCheckOutAt = fromDateInputValue(
      checkOut,
      row?.baseCheckOutAt ?? Date.now(),
      timeZone
    )
    if (baseCheckInAt === null || baseCheckOutAt === null) {
      setError("Check-in and check-out must be valid dates.")
      return
    }
    if (baseCheckOutAt <= baseCheckInAt) {
      setError("Check-out must be after check-in.")
      return
    }
    setIsPending(true)
    try {
      await upsert({
        eventId,
        baseCheckInAt,
        baseCheckOutAt,
        allowExtendedStayBefore: extendBefore || extendBoth,
        allowExtendedStayAfter: extendAfter || extendBoth,
        allowExtendedStayBoth: extendBoth,
        breakfastIncluded,
      })
      setSuccess("Stay configuration saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stay configuration.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle>Stay configuration</CardTitle>
        <CardDescription>
          Check-in and check-out for the base stay. Breakfast is included in all room
          prices and carries no charge.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
          <legend className="sr-only">Stay window</legend>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="uo-check-in">Check-in date</Label>
            <Input
              id="uo-check-in"
              type="date"
              value={checkIn}
              onChange={(event) => setCheckIn(event.target.value)}
              aria-invalid={error !== null && !checkIn}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="uo-check-out">Check-out date</Label>
            <Input
              id="uo-check-out"
              type="date"
              value={checkOut}
              onChange={(event) => setCheckOut(event.target.value)}
              aria-invalid={error !== null && !checkOut}
            />
          </div>
        </fieldset>

        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">Extended stays</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={extendBefore}
                onChange={(event) => setExtendBefore(event.target.checked)}
              />
              Before the event
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={extendAfter}
                onChange={(event) => setExtendAfter(event.target.checked)}
              />
              After the event
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={extendBoth}
                onChange={(event) => setExtendBoth(event.target.checked)}
              />
              Both
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Extended stays may be allowed before, after, or both. The night count is
            derived server-side from the stay window.
          </p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={breakfastIncluded}
            onChange={(event) => setBreakfastIncluded(event.target.checked)}
          />
          Breakfast is included in room prices
        </label>

        <Separator />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Save stay configuration
          </Button>
          <Feedback error={error} success={success} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Rates per person per night
// ---------------------------------------------------------------------------

function RateGridSection({
  eventId,
  config,
}: {
  eventId: Id<"events">
  config: EventConfigResponse
}) {
  const upsert = useUpsertEventAccommodationRate()

  // Grid rows: every reusable catalog category so a fresh event with zero
  // rates can create its first rows instead of dead-ending on "no active
  // categories" (CR-05). Blank occupancy cells are left unchanged on save;
  // explicit €0 is preserved. Falls back to the server-derived active
  // categories only when the catalog did not load.
  const categories =
    (config.catalogCategories ?? []).length > 0
      ? config.catalogCategories
      : (config.activeCategories ?? [])
  const rateByKey = useMemo(() => {
    const map = new Map<string, ConfigRate>()
    for (const rate of config.rates ?? []) {
      map.set(`${String(rate.categoryId)}:${rate.occupancy}`, rate)
    }
    return map
  }, [config.rates])

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const serverKey = config.config?.updatedAt ?? "unconfigured"
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const rate of config.rates ?? []) {
      next[`${String(rate.categoryId)}:${rate.occupancy}`] = String(
        rate.pricePerPersonMinor
      )
    }
    setDrafts(next)
    setError(null)
    setSuccess(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey])

  const setDraft = (categoryId: string, occupancy: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [`${categoryId}:${occupancy}`]: value,
    }))
  }

  const saveAll = async () => {
    setError(null)
    setSuccess(null)
    setIsPending(true)
    let saved = 0
    let failed = 0
    for (const category of categories) {
      for (const occupancy of OCCUPANCIES) {
        const raw = drafts[`${String(category._id)}:${occupancy.value}`]
        if (raw === undefined || raw.trim() === "") continue
        const value = Number(raw)
        if (!Number.isInteger(value) || value < 0) {
          failed += 1
          continue
        }
        try {
          await upsert({
            eventId,
            categoryId: category._id,
            occupancy: occupancy.value,
            pricePerPersonMinor: value,
          })
          saved += 1
        } catch (err) {
          failed += 1
          setError(
            err instanceof Error
              ? err.message
              : "A rate could not be saved."
          )
        }
      }
    }
    setIsPending(false)
    if (failed === 0 && saved > 0) {
      setSuccess("Rates saved.")
    } else if (saved === 0 && failed > 0) {
      setError("No valid rates were saved. Prices must be whole minor units (cents).")
    } else if (saved > 0 && failed > 0) {
      setSuccess(`${saved} rate${saved === 1 ? "" : "s"} saved; ${failed} skipped.`)
    } else {
      setError("Enter at least one rate to save.")
    }
  }

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle>Rates per person per night</CardTitle>
        <CardDescription>
          Per-person, per-night prices in whole cents (minor units). A superior upgrade
          is represented by the configured superior category rate — there is no separate
          upgrade formula. Leave a blank cell unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No categories are seeded in the reusable catalog yet. Rates appear
            here once the catalog is populated.
          </p>
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-0 border-collapse text-sm">
              <caption className="sr-only">
                Per-person per-night rates by category and occupancy
              </caption>
              <thead>
                <tr className="border-b border-border/60">
                  <th scope="col" className="p-3 text-left font-medium">
                    Category
                  </th>
                  {OCCUPANCIES.map((occupancy) => (
                    <th
                      key={occupancy.value}
                      scope="col"
                      className="p-3 text-left font-medium"
                    >
                      {occupancy.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category._id} className="border-b border-border/40 last:border-b-0">
                    <th
                      scope="row"
                      className="p-3 text-left font-medium whitespace-nowrap"
                    >
                      {category.label}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {category.code}
                      </span>
                    </th>
                    {OCCUPANCIES.map((occupancy) => {
                      const key = `${String(category._id)}:${occupancy.value}`
                      const existing = rateByKey.get(key)
                      const raw = drafts[key]
                      return (
                        <td key={occupancy.value} className="min-w-0 p-3">
                          <div className="min-w-0 space-y-1">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              aria-label={`${category.label} ${occupancy.label} price per person per night in cents`}
                              value={raw ?? ""}
                              placeholder={existing ? String(existing.pricePerPersonMinor) : "—"}
                              onChange={(event) =>
                                setDraft(String(category._id), occupancy.value, event.target.value)
                              }
                              className="w-full min-w-28 font-mono tabular-nums"
                            />
                            <p className="text-xs text-muted-foreground">
                              {existing !== undefined
                                ? `${formatMoney(existing.pricePerPersonMinor)} / person / night`
                                : "Not configured"}
                            </p>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Separator />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={saveAll} disabled={isPending || categories.length === 0}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Save rates
          </Button>
          <Feedback error={error} success={success} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Upgrades & options
// ---------------------------------------------------------------------------

function OptionSection({
  eventId,
  config,
}: {
  eventId: Id<"events">
  config: EventConfigResponse
}) {
  const upsert = useUpsertEventAccommodationOption()
  const options = config.options ?? []
  const catalogOptions = config.catalogOptions ?? []
  const configuredByOptionId = useMemo(
    () => new Map(options.map((option) => [String(option.optionId), option])),
    [options]
  )

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle>Upgrades &amp; options</CardTitle>
        <CardDescription>
          Optional per-night add-ons. The superior upgrade moves a buyer to the superior
          category rate; the cot is available for children under 3 only. Explicit €0
          prices are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {catalogOptions.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No options are seeded in the reusable catalog yet. Options appear here once
            the catalog is populated.
          </p>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {catalogOptions.map((catalogOption) => {
              const configured = configuredByOptionId.get(
                String(catalogOption._id)
              )
              return configured ? (
                <OptionCard
                  key={catalogOption._id}
                  eventId={eventId}
                  option={configured}
                  upsert={upsert}
                />
              ) : (
                <UnconfiguredOptionCard
                  key={catalogOption._id}
                  eventId={eventId}
                  option={catalogOption}
                  upsert={upsert}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OptionCard({
  eventId,
  option,
  upsert,
}: {
  eventId: Id<"events">
  option: ConfigOption
  upsert: ReturnType<typeof useUpsertEventAccommodationOption>
}) {
  const [enabled, setEnabled] = useState(option.enabled)
  const [price, setPrice] = useState(String(option.priceMinor))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const isCot = option.optionCode === "cot"
  const isSuperiorUpgrade = option.optionCode === "superior_upgrade"

  useEffect(() => {
    setEnabled(option.enabled)
    setPrice(String(option.priceMinor))
    setError(null)
    setSuccess(null)
  }, [option._id, option.enabled, option.priceMinor])

  const save = async () => {
    setError(null)
    setSuccess(null)
    const value = Number(price)
    if (!Number.isInteger(value) || value < 0) {
      setError("Price must be a whole number of cents (minor units).")
      return
    }
    setIsPending(true)
    try {
      await upsert({
        eventId,
        optionId: option.optionId,
        enabled,
        priceMinor: value,
        ...(isCot ? { eligibilityAgeBandCode: "under_3" } : {}),
      })
      setSuccess(
        `${option.optionLabel ?? "Option"} ${enabled ? "enabled" : "disabled"}.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save option.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">
            {option.optionLabel ?? option.optionCode ?? "Option"}
          </p>
          <p className="text-xs text-muted-foreground">
            {option.kind === "upgrade"
              ? "Upgrade · per night"
              : option.kind === "addon"
                ? "Add-on · per night"
                : "Per night"}
            {isCot && " · under 3 only"}
          </p>
        </div>
        <Badge variant={enabled ? "secondary" : "outline"}>
          {enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Offer this option to buyers
      </label>

      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-option-${option.optionId}`}>
          Price per night in cents{isSuperiorUpgrade ? " (per person)" : ""}
        </Label>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            id={`uo-option-${option.optionId}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-40 font-mono tabular-nums"
          />
          <span className="text-sm text-muted-foreground">
            Current: {formatMoney(option.priceMinor)} / night
          </span>
        </div>
      </div>

      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save option
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}

/**
 * Card for a reusable catalog option that has no event row yet. Saving calls
 * the same upsert mutation, which inserts the event configuration row — the
 * first option of an unconfigured event can be created here instead of
 * dead-ending on an empty state (CR-05).
 */
function UnconfiguredOptionCard({
  eventId,
  option,
  upsert,
}: {
  eventId: Id<"events">
  option: CatalogOption
  upsert: ReturnType<typeof useUpsertEventAccommodationOption>
}) {
  const [enabled, setEnabled] = useState(false)
  const [price, setPrice] = useState("0")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const isCot = option.code === "cot"
  const isSuperiorUpgrade = option.code === "superior_upgrade"

  const save = async () => {
    setError(null)
    setSuccess(null)
    const value = Number(price)
    if (!Number.isInteger(value) || value < 0) {
      setError("Price must be a whole number of cents (minor units).")
      return
    }
    setIsPending(true)
    try {
      await upsert({
        eventId,
        optionId: option._id,
        enabled,
        priceMinor: value,
        ...(isCot ? { eligibilityAgeBandCode: "under_3" } : {}),
      })
      setSuccess(`${option.label} configured for this event.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save option.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-dashed border-border/70 p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-semibold">
            {option.label}{" "}
            <span className="ml-1 font-mono text-xs text-muted-foreground">
              {option.code}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {option.kind === "upgrade"
              ? "Upgrade · per night"
              : option.kind === "addon"
                ? "Add-on · per night"
                : "Per night"}
            {isCot && " · under 3 only"} · not configured for this event yet
          </p>
        </div>
        <Badge variant="outline">Not configured</Badge>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Offer this option to buyers
      </label>

      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-new-option-${option._id}`}>
          Price per night in cents{isSuperiorUpgrade ? " (per person)" : ""}
        </Label>
        <Input
          id={`uo-new-option-${option._id}`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="w-40 font-mono tabular-nums"
        />
      </div>

      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Configure for this event
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Age-band pricing
// ---------------------------------------------------------------------------

function AgePricingSection({
  eventId,
  config,
  catalogAgeBands,
}: {
  eventId: Id<"events">
  config: EventConfigResponse
  catalogAgeBands: CatalogAgeBand[]
}) {
  const agePricing = useMemo(() => config.agePricing ?? [], [config.agePricing])
  const bandLabelByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const band of catalogAgeBands) {
      map.set(band.code, band.label)
    }
    for (const row of agePricing) {
      if (!map.has(row.ageBandCode)) {
        map.set(row.ageBandCode, row.ageBandCode)
      }
    }
    return map
  }, [catalogAgeBands, agePricing])

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle>Age-band pricing</CardTitle>
        <CardDescription>
          Optional per-age-band pricing rules. Rules may be left empty and seeded later;
          breakfast is included for every attendee.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {agePricing.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No age-band pricing rules configured. You can leave this empty — age pricing
            can be seeded later.
          </p>
        ) : (
          <div className="min-w-0 space-y-3">
            {agePricing.map((row) => (
              <AgePricingRow
                key={row._id}
                eventId={eventId}
                row={row}
                bandLabel={bandLabelByCode.get(row.ageBandCode) ?? row.ageBandCode}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AgePricingRow({
  eventId,
  row,
  bandLabel,
}: {
  eventId: Id<"events">
  row: ConfigAgePricing
  bandLabel: string
}) {
  const upsert = useUpsertEventAccommodationAgePricing()
  const [rateType, setRateType] = useState(row.rateType)
  const [value, setValue] = useState(String(row.value))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    setRateType(row.rateType)
    setValue(String(row.value))
    setError(null)
    setSuccess(null)
  }, [row._id, row.rateType, row.value])

  const valueDisabled = rateType === "free" || rateType === "full"

  const save = async () => {
    setError(null)
    setSuccess(null)
    const numeric = valueDisabled ? 0 : Number(value)
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError("Value must be a non-negative number.")
      return
    }
    if (rateType === "percent" && numeric > 100) {
      setError("Percent values must be between 0 and 100.")
      return
    }
    if (rateType === "flat" && !Number.isInteger(numeric)) {
      setError("Flat values must be whole minor units.")
      return
    }
    setIsPending(true)
    try {
      await upsert({
        eventId,
        ageBandCode: row.ageBandCode as ConfigAgePricing["ageBandCode"],
        rateType,
        value: numeric,
        sortOrder: row.sortOrder,
      })
      setSuccess("Age-pricing rule saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save age-pricing rule.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-border/60 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <div className="min-w-0">
        <p className="text-sm font-medium">{bandLabel}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {row.ageBandCode} · locked age bounds
        </p>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`uo-age-type-${row.ageBandCode}`} className="sr-only">
          Rule type
        </Label>
        <select
          id={`uo-age-type-${row.ageBandCode}`}
          className="h-9 w-full min-w-32 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={rateType}
          onChange={(event) =>
            setRateType(event.target.value as ConfigAgePricing["rateType"])
          }
        >
          {RATE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`uo-age-value-${row.ageBandCode}`}>
          {rateType === "percent" ? "Percent" : rateType === "flat" ? "Cents" : "Value"}
        </Label>
        <Input
          id={`uo-age-value-${row.ageBandCode}`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          disabled={valueDisabled}
          value={valueDisabled ? "0" : value}
          onChange={(event) => setValue(event.target.value)}
          className="w-full min-w-28 font-mono tabular-nums sm:w-32"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save rule
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

function AvailabilitySection({
  eventId,
  config,
}: {
  eventId: Id<"events">
  config: EventConfigResponse
}) {
  const upsert = useUpsertEventAccommodationResource()
  const resources = config.resources ?? []
  const catalogRoomTypes = config.catalogRoomTypes ?? []

  const roomResourceByRoomTypeId = useMemo(() => {
    const map = new Map<string, ConfigResource>()
    for (const resource of resources) {
      if (resource.kind === "room" && resource.roomTypeId) {
        map.set(String(resource.roomTypeId), resource)
      }
    }
    return map
  }, [resources])
  const hasCotResource = resources.some((resource) => resource.kind === "cot")
  const unconfiguredRoomTypes = catalogRoomTypes.filter(
    (roomType) => !roomResourceByRoomTypeId.has(String(roomType._id))
  )
  const showEmpty = catalogRoomTypes.length === 0 && !hasCotResource

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle>Availability</CardTitle>
        <CardDescription>
          Physical room and cot counts. Sellable beds are derived server-side from room
          count × capacity; the browser never calculates availability.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {showEmpty ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No room types are seeded in the reusable catalog yet. Availability
            appears here once the catalog is populated.
          </p>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((resource) => (
              <ResourceCard
                key={resource._id}
                eventId={eventId}
                resource={resource}
                upsert={upsert}
              />
            ))}
            {unconfiguredRoomTypes.map((roomType) => (
              <AddRoomResourceCard
                key={roomType._id}
                eventId={eventId}
                roomType={roomType}
                upsert={upsert}
              />
            ))}
            {!hasCotResource && <AddCotResourceCard eventId={eventId} upsert={upsert} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResourceCard({
  eventId,
  resource,
  upsert,
}: {
  eventId: Id<"events">
  resource: ConfigResource
  upsert: ReturnType<typeof useUpsertEventAccommodationResource>
}) {
  const [count, setCount] = useState(String(resource.count))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    setCount(String(resource.count))
    setError(null)
    setSuccess(null)
  }, [resource._id, resource.count])

  const save = async () => {
    setError(null)
    setSuccess(null)
    const value = Number(count)
    if (!Number.isInteger(value) || value < 0) {
      setError("Count must be a whole number.")
      return
    }
    setIsPending(true)
    try {
      await upsert({
        eventId,
        kind: resource.kind,
        ...(resource.kind === "room" && resource.roomTypeId
          ? { roomTypeId: resource.roomTypeId }
          : {}),
        count: value,
      })
      setSuccess("Availability saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save availability.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border/60 p-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-sm font-semibold">
          {resource.kind === "cot" ? "Cot" : (resource.roomTypeLabel ?? "Room type")}
        </p>
        <p className="text-xs text-muted-foreground">
          {resource.kind === "room" ? "Room resource" : "Cot resource"} · sellable beds:{" "}
          <span className="font-mono tabular-nums">{resource.sellableBeds}</span>
        </p>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`uo-resource-${resource._id}`}>Physical count</Label>
        <Input
          id={`uo-resource-${resource._id}`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          className="w-full font-mono tabular-nums"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save availability
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}

/**
 * Add-card for a reusable room type that has no event resource yet. Saving
 * calls the same resource upsert to create the first availability row of an
 * unconfigured event (CR-05).
 */
function AddRoomResourceCard({
  eventId,
  roomType,
  upsert,
}: {
  eventId: Id<"events">
  roomType: CatalogRoomType
  upsert: ReturnType<typeof useUpsertEventAccommodationResource>
}) {
  const [count, setCount] = useState("0")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const save = async () => {
    setError(null)
    setSuccess(null)
    const value = Number(count)
    if (!Number.isInteger(value) || value < 0) {
      setError("Count must be a whole number.")
      return
    }
    setIsPending(true)
    try {
      await upsert({
        eventId,
        kind: "room",
        roomTypeId: roomType._id,
        count: value,
      })
      setSuccess("Availability saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save availability.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-dashed border-border/70 p-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-sm font-semibold">{roomType.label}</p>
        <p className="text-xs text-muted-foreground">
          Room resource · not configured · default capacity{" "}
          <span className="font-mono tabular-nums">{roomType.defaultCapacity}</span>
        </p>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`uo-add-room-${roomType._id}`}>Physical count</Label>
        <Input
          id={`uo-add-room-${roomType._id}`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          className="w-full font-mono tabular-nums"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Add room availability
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}

/** Add-card for the event's physical cot count when no cot resource exists yet. */
function AddCotResourceCard({
  eventId,
  upsert,
}: {
  eventId: Id<"events">
  upsert: ReturnType<typeof useUpsertEventAccommodationResource>
}) {
  const [count, setCount] = useState("0")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const save = async () => {
    setError(null)
    setSuccess(null)
    const value = Number(count)
    if (!Number.isInteger(value) || value < 0) {
      setError("Count must be a whole number.")
      return
    }
    setIsPending(true)
    try {
      await upsert({ eventId, kind: "cot", count: value })
      setSuccess("Availability saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save availability.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-dashed border-border/70 p-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-sm font-semibold">Cot</p>
        <p className="text-xs text-muted-foreground">
          Cot resource · not configured
        </p>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="uo-add-cot">Physical count</Label>
        <Input
          id="uo-add-cot"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          className="w-full font-mono tabular-nums"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Add cot availability
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}
