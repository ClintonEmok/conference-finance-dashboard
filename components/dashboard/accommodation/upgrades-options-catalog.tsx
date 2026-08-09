"use client"

import { useEffect, useRef, useState } from "react"
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
import type { Id } from "@/convex/_generated/dataModel"
import {
  useUpdateAccommodationCategory,
  useUpdateAccommodationOption,
  useUpdateRoomType,
} from "@/lib/convex/hooks/accommodation"

type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string; onRetry?: () => void }
  | { status: "ready" }

type CatalogCategory = {
  _id: Id<"accommodationCategories">
  code: string
  label: string
  description?: string
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
  count?: number
  description?: string
  notes?: string
  categoryId?: Id<"accommodationCategories">
}

type CatalogData = {
  categories: CatalogCategory[]
  options: CatalogOption[]
  roomTypes: CatalogRoomType[]
}

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

export function UpgradesOptionsCatalog({
  catalogState,
  catalogResult,
}: {
  catalogState: CatalogState
  catalogResult: CatalogData | Error | undefined
}) {
  if (catalogState.status === "loading") {
    return (
      <Card className="border-border/60 bg-card shadow-none">
        <CardHeader>
          <CardTitle>Reusable catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading catalog…</p>
        </CardContent>
      </Card>
    )
  }

  if (catalogState.status === "error") {
    return (
      <Card className="border-border/60 bg-card shadow-none">
        <CardHeader>
          <CardTitle>Reusable catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {catalogState.message}
          </p>
          {catalogState.onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={catalogState.onRetry}
            >
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const catalog = (catalogResult ?? {
    categories: [],
    options: [],
    roomTypes: [],
  }) as CatalogData

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle>Reusable catalog</CardTitle>
        <CardDescription>
          Shared catalog used by every event. Codes are locked; labels and
          descriptions can be edited to inform room allocation.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-6">
        <CategoryList categories={catalog.categories} />
        <OptionList options={catalog.options} />
        <RoomTypeList roomTypes={catalog.roomTypes} />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function CategoryList({ categories }: { categories: CatalogCategory[] }) {
  const update = useUpdateAccommodationCategory()

  if (categories.length === 0) {
    return (
      <section className="min-w-0 space-y-2">
        <h3 className="text-base font-semibold">Categories</h3>
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No categories seeded yet. Categories are added through the catalog seed.
        </p>
      </section>
    )
  }

  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-base font-semibold">Categories</h3>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {categories.map((category) => (
          <CategoryRow key={category._id} category={category} update={update} />
        ))}
      </div>
    </section>
  )
}

function CategoryRow({
  category,
  update,
}: {
  category: CatalogCategory
  update: ReturnType<typeof useUpdateAccommodationCategory>
}) {
  const [label, setLabel] = useState(category.label)
  const [description, setDescription] = useState(category.description ?? "")
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    setLabel(category.label)
    setDescription(category.description ?? "")
    setSortOrder(String(category.sortOrder))
    setError(null)
    setSuccess(null)
  }, [category._id, category.label, category.description, category.sortOrder])

  const save = async () => {
    setError(null)
    setSuccess(null)
    const order = Number(sortOrder)
    if (!Number.isInteger(order) || order < 0) {
      setError("Sort order must be a whole number.")
      return
    }
    setIsPending(true)
    try {
      await update({
        categoryId: category._id,
        label: label.trim() || undefined,
        description: description.trim() || undefined,
        sortOrder: order,
      })
      setSuccess("Category saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {label || category.label}{" "}
          <Badge variant="outline" className="ml-1 font-mono">
            {category.code}
          </Badge>
        </p>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`uo-cat-order-${category._id}`} className="sr-only">
            Sort order
          </Label>
          <Input
            id={`uo-cat-order-${category._id}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className="w-20 font-mono tabular-nums"
            aria-label={`${label || category.label} sort order`}
          />
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-cat-label-${category._id}`}>Label</Label>
        <Input
          id={`uo-cat-label-${category._id}`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-cat-desc-${category._id}`}>Description</Label>
        <textarea
          id={`uo-cat-desc-${category._id}`}
          className="min-h-20 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save category
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function OptionList({ options }: { options: CatalogOption[] }) {
  const update = useUpdateAccommodationOption()

  if (options.length === 0) {
    return (
      <section className="min-w-0 space-y-2">
        <h3 className="text-base font-semibold">Options</h3>
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No options seeded yet.
        </p>
      </section>
    )
  }

  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-base font-semibold">Options</h3>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {options.map((option) => (
          <OptionRow key={option._id} option={option} update={update} />
        ))}
      </div>
    </section>
  )
}

function OptionRow({
  option,
  update,
}: {
  option: CatalogOption
  update: ReturnType<typeof useUpdateAccommodationOption>
}) {
  const [label, setLabel] = useState(option.label)
  const [description, setDescription] = useState(option.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    setLabel(option.label)
    setDescription(option.description ?? "")
    setError(null)
    setSuccess(null)
  }, [option._id, option.label, option.description])

  const save = async () => {
    setError(null)
    setSuccess(null)
    setIsPending(true)
    try {
      await update({
        optionId: option._id,
        label: label.trim() || undefined,
        description: description.trim() || undefined,
      })
      setSuccess("Option saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save option.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-semibold">
        {label || option.label}{" "}
        <Badge variant="outline" className="ml-1 font-mono">
          {option.code}
        </Badge>
      </p>
      <p className="text-xs text-muted-foreground">
        {option.kind} · {option.unit.replace("_", " ")}
      </p>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-opt-label-${option._id}`}>Label</Label>
        <Input
          id={`uo-opt-label-${option._id}`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-opt-desc-${option._id}`}>Description</Label>
        <textarea
          id={`uo-opt-desc-${option._id}`}
          className="min-h-20 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
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

// ---------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------

function RoomTypeList({ roomTypes }: { roomTypes: CatalogRoomType[] }) {
  const update = useUpdateRoomType()

  if (roomTypes.length === 0) {
    return (
      <section className="min-w-0 space-y-2">
        <h3 className="text-base font-semibold">Room types</h3>
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No room types seeded yet.
        </p>
      </section>
    )
  }

  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-base font-semibold">Room types</h3>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {roomTypes.map((roomType) => (
          <RoomTypeRow key={roomType._id} roomType={roomType} update={update} />
        ))}
      </div>
    </section>
  )
}

function RoomTypeRow({
  roomType,
  update,
}: {
  roomType: CatalogRoomType
  update: ReturnType<typeof useUpdateRoomType>
}) {
  const [label, setLabel] = useState(roomType.label)
  const [description, setDescription] = useState(roomType.description ?? "")
  const [notes, setNotes] = useState(roomType.notes ?? "")
  const [count, setCount] = useState(
    roomType.count !== undefined ? String(roomType.count) : ""
  )
  const [defaultCapacity, setDefaultCapacity] = useState(
    String(roomType.defaultCapacity)
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  // Tracks which fields the admin has edited so an external server update
  // (another admin saving the same room type) only rehydrates the untouched
  // fields — a stale draft must never overwrite newer server values (WR-05).
  const dirtyRef = useRef({
    label: false,
    description: false,
    notes: false,
    count: false,
    defaultCapacity: false,
  })
  const previousIdRef = useRef(roomType._id)

  useEffect(() => {
    if (previousIdRef.current !== roomType._id) {
      // A different room-type row: reset every draft and dirty flag.
      previousIdRef.current = roomType._id
      dirtyRef.current = {
        label: false,
        description: false,
        notes: false,
        count: false,
        defaultCapacity: false,
      }
    }
    const dirty = dirtyRef.current
    if (!dirty.label) setLabel(roomType.label)
    if (!dirty.description) setDescription(roomType.description ?? "")
    if (!dirty.notes) setNotes(roomType.notes ?? "")
    if (!dirty.count) {
      setCount(roomType.count !== undefined ? String(roomType.count) : "")
    }
    if (!dirty.defaultCapacity) setDefaultCapacity(String(roomType.defaultCapacity))
    setError(null)
    setSuccess(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roomType._id,
    roomType.label,
    roomType.description,
    roomType.notes,
    roomType.count,
    roomType.defaultCapacity,
  ])

  const markDirty = (field: keyof typeof dirtyRef.current) => {
    dirtyRef.current[field] = true
  }

  const save = async () => {
    setError(null)
    setSuccess(null)
    const capacity = Number(defaultCapacity)
    if (!Number.isInteger(capacity) || capacity < 1) {
      setError("Default capacity must be a positive whole number.")
      return
    }
    if (count.trim() !== "") {
      const numericCount = Number(count)
      if (!Number.isInteger(numericCount) || numericCount < 0) {
        setError("Physical count must be a whole number.")
        return
      }
    }
    setIsPending(true)
    try {
      await update({
        roomTypeId: roomType._id,
        label: label.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        count: count.trim() === "" ? undefined : Number(count),
        defaultCapacity: capacity,
      })
      // Local state now matches the server; future prop updates may rehydrate.
      dirtyRef.current = {
        label: false,
        description: false,
        notes: false,
        count: false,
        defaultCapacity: false,
      }
      setSuccess("Room type saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save room type.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border/60 p-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-sm font-semibold">
          {label || roomType.label}
        </p>
        <p className="text-xs text-muted-foreground">
          {roomType.categoryId ? `Category ${roomType.categoryId}` : "No category"} ·
          bed arrangement is part of the label
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`uo-rt-capacity-${roomType._id}`}>Default capacity</Label>
          <Input
            id={`uo-rt-capacity-${roomType._id}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={defaultCapacity}
            onChange={(event) => {
              setDefaultCapacity(event.target.value)
              markDirty("defaultCapacity")
            }}
            className="font-mono tabular-nums"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`uo-rt-count-${roomType._id}`}>Physical count</Label>
          <Input
            id={`uo-rt-count-${roomType._id}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={count}
            onChange={(event) => {
              setCount(event.target.value)
              markDirty("count")
            }}
            className="font-mono tabular-nums"
            placeholder="—"
          />
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-rt-label-${roomType._id}`}>Label</Label>
          <Input
            id={`uo-rt-label-${roomType._id}`}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value)
              markDirty("label")
            }}
          />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-rt-desc-${roomType._id}`}>Description</Label>
        <textarea
          id={`uo-rt-desc-${roomType._id}`}
          className="min-h-20 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            markDirty("description")
          }}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`uo-rt-notes-${roomType._id}`}>Notes</Label>
        <textarea
          id={`uo-rt-notes-${roomType._id}`}
          className="min-h-16 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value)
            markDirty("notes")
          }}
        />
      </div>
      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save room type
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </div>
  )
}
