"use client"

import { use, useState, useEffect } from "react"
import { Ticket, Plus, CreditCard, Edit, Trash2, GripVertical, Check, Copy } from "lucide-react"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  useTicketTypesForEvent,
  useCreateTicketType,
  useUpdateTicketType,
  useReorderTicketTypes,
  useDeleteTicketType,
  useEventBySlug,
} from "@/lib/convex/hooks/events"
import { useRoomTypes } from "@/lib/convex/hooks/accommodation"
import { Id } from "@/convex/_generated/dataModel"

function reorderItems(items: string[], fromIndex: number, toIndex: number) {
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function TicketTypeRow({
  ticket,
  index,
  eventCurrency,
  onEdit,
  onDelete,
}: {
  ticket: any
  index: number
  eventCurrency: string
  onEdit: (ticket: any) => void
  onDelete: (ticketTypeId: string) => void
}) {
  const sortable = useSortable({ id: ticket._id, index })

  return (
    <div
      ref={sortable.ref}
      className={cn(
        "flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4",
        sortable.isDragging && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <Button
          ref={sortable.handleRef as any}
          variant="ghost"
          size="icon"
          className="mt-0.5 size-8 cursor-grab"
          aria-label={`Reorder ${ticket.label}`}
        >
          <GripVertical className="size-4" />
        </Button>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{ticket.label}</p>
            <Badge
              variant={ticket.isActive ? "default" : "outline"}
              className="text-[10px]"
            >
              {ticket.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {ticket.visibility}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {eventCurrency} {(ticket.priceMinor / 100).toFixed(2)}
            {ticket.maxQuantity && (
              <span className="ml-2">
                · {ticket.maxQuantity - (ticket.soldCount || 0)} of{" "}
                {ticket.maxQuantity} available
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(ticket)}>
          <Edit className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(ticket._id)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export default function EventTicketsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  
  // State from old monolithic page
  const [isAddingTicket, setIsAddingTicket] = useState(false)
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null)
  const [ticketLabel, setTicketLabel] = useState("")
  const [ticketPrice, setTicketPrice] = useState("")
  const [ticketQuantity, setTicketQuantity] = useState("")
  const [ticketIsActive, setTicketIsActive] = useState(true)
  const [ticketVisibility, setTicketVisibility] = useState<"public" | "hidden">(
    "public"
  )
  const [ticketRoomTypeId, setTicketRoomTypeId] =
    useState<Id<"accommodationRoomTypes"> | null>(null)
  const [ticketOrder, setTicketOrder] = useState<string[]>([])

  const ticketTypes = useTicketTypesForEvent(event?._id)
  const roomTypes = useRoomTypes()
  const createTicketType = useCreateTicketType()
  const updateTicketType = useUpdateTicketType()
  const reorderTicketTypes = useReorderTicketTypes()
  const deleteTicketType = useDeleteTicketType()

  useEffect(() => {
    if (!ticketTypes.ticketTypes) return
    const nextOrder = ticketTypes.ticketTypes.map((ticket: any) =>
      String(ticket._id)
    )
    setTicketOrder((current) => {
      if (
        current.length === nextOrder.length &&
        current.every((id, index) => id === nextOrder[index])
      ) {
        return current
      }
      return nextOrder
    })
  }, [ticketTypes.ticketTypes])

  if (!event) return null

  const handleAddTicket = async () => {
    if (!event || !ticketLabel.trim() || !ticketPrice) return
    try {
      await createTicketType({
        eventId: event._id,
        label: ticketLabel.trim(),
        priceMinor: Math.round(parseFloat(ticketPrice) * 100),
        maxQuantity: ticketQuantity ? parseInt(ticketQuantity) : undefined,
        isActive: ticketIsActive,
        visibility: ticketVisibility,
        roomTypeId: ticketRoomTypeId ?? undefined,
      })
      cancelTicketEdit()
    } catch (err) {
      console.error("Failed to create ticket:", err)
    }
  }

  const handleUpdateTicket = async () => {
    if (!editingTicketId || !ticketLabel.trim() || !ticketPrice) return
    try {
      await updateTicketType({
        ticketTypeId: editingTicketId as any,
        label: ticketLabel.trim(),
        priceMinor: Math.round(parseFloat(ticketPrice) * 100),
        maxQuantity: ticketQuantity ? parseInt(ticketQuantity) : undefined,
        isActive: ticketIsActive,
        visibility: ticketVisibility,
        roomTypeId: ticketRoomTypeId ?? undefined,
      })
      cancelTicketEdit()
    } catch (err) {
      console.error("Failed to update ticket:", err)
    }
  }

  const handleDeleteTicket = async (ticketTypeId: string) => {
    if (!confirm("Are you sure you want to delete this ticket type?")) return
    try {
      await deleteTicketType({ ticketTypeId: ticketTypeId as any })
    } catch (err) {
      console.error("Failed to delete ticket:", err)
    }
  }

  const cancelTicketEdit = () => {
    setIsAddingTicket(false)
    setEditingTicketId(null)
    setTicketLabel("")
    setTicketPrice("")
    setTicketQuantity("")
    setTicketIsActive(true)
    setTicketVisibility("public")
    setTicketRoomTypeId(null)
  }

  const startEditingTicket = (ticket: any) => {
    setEditingTicketId(ticket._id)
    setTicketLabel(ticket.label)
    setTicketPrice((ticket.priceMinor / 100).toFixed(2))
    setTicketQuantity(ticket.maxQuantity?.toString() ?? "")
    setTicketIsActive(ticket.isActive)
    setTicketVisibility(ticket.visibility)
    setTicketRoomTypeId(ticket.roomTypeId ?? null)
  }

  const handleTicketDragEnd = async (eventData: any) => {
    if (eventData.canceled) return
    const { source } = eventData.operation
    if (!isSortable(source)) return
    const sortableSource = source as any
    const { initialIndex, index } = sortableSource
    if (initialIndex === index) return

    const previousOrder = ticketOrder.length
      ? ticketOrder
      : ticketTypes.ticketTypes.map((ticket: any) => String(ticket._id))
    const nextOrder = reorderItems(previousOrder, initialIndex, index)
    setTicketOrder(nextOrder)

    try {
      await reorderTicketTypes({
        eventId: event._id,
        orderedTicketTypeIds: nextOrder as any,
      })
    } catch (err) {
      console.error("Failed to reorder ticket types:", err)
      setTicketOrder(previousOrder)
    }
  }

  const orderedTicketIds = ticketOrder.length === ticketTypes.ticketTypes?.length
    ? ticketOrder
    : (ticketTypes.ticketTypes?.map((ticket: any) => String(ticket._id)) ?? [])

  return (
    <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold">Ticket Types</CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Manage ticket types, pricing, and availability
            </CardDescription>
          </div>
          {!isAddingTicket && !editingTicketId && (
            <Button 
              onClick={() => setIsAddingTicket(true)}
              className="rounded-xl shadow-lg shadow-primary/20"
            >
              <Plus className="mr-2 size-4" />
              Add Ticket
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {(isAddingTicket || editingTicketId) && (
          <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-6 animate-in fade-in zoom-in-95 duration-300">
            <h4 className="text-sm font-black tracking-widest text-primary uppercase">
              {editingTicketId ? "Edit Ticket" : "New Ticket"}
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Ticket Name</label>
                <Input
                  type="text"
                  value={ticketLabel}
                  onChange={(e) => setTicketLabel(e.target.value)}
                  placeholder="e.g., Early Bird, Standard"
                  className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Price ({event.currency})
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ticketPrice}
                  onChange={(e) => setTicketPrice(e.target.value)}
                  placeholder="0.00"
                  className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Quantity Available
                </label>
                <Input
                  type="number"
                  min="0"
                  value={ticketQuantity}
                  onChange={(e) => setTicketQuantity(e.target.value)}
                  placeholder="Unlimited"
                  className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Visibility</label>
                <select
                  value={ticketVisibility}
                  onChange={(e) =>
                    setTicketVisibility(
                      e.target.value as "public" | "hidden"
                    )
                  }
                  className="flex h-10 w-full rounded-xl border border-white/20 bg-white/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:bg-black/20"
                >
                  <option value="public" className="dark:bg-zinc-900">Public</option>
                  <option value="hidden" className="dark:bg-zinc-900">Hidden</option>
                </select>
              </div>
              {event?.accommodationEnabled && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Room Type Override
                  </label>
                  <select
                    value={ticketRoomTypeId ?? ""}
                    onChange={(e) =>
                      setTicketRoomTypeId(
                        e.target.value
                          ? (e.target.value as Id<"accommodationRoomTypes">)
                          : null
                      )
                    }
                    className="flex h-10 w-full rounded-xl border border-white/20 bg-white/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:bg-black/20"
                  >
                    <option value="" className="dark:bg-zinc-900">Use event default</option>
                    {roomTypes.map((rt: any) => (
                      <option key={rt._id} value={rt._id} className="dark:bg-zinc-900">
                        {rt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase cursor-pointer">
                <input
                  type="checkbox"
                  checked={ticketIsActive}
                  onChange={(e) => setTicketIsActive(e.target.checked)}
                  className="size-4 rounded border-white/20 bg-white/50 dark:bg-black/20"
                />
                Active
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={cancelTicketEdit} className="rounded-xl border-white/20">
                Cancel
              </Button>
              <Button
                onClick={
                  editingTicketId ? handleUpdateTicket : handleAddTicket
                }
                disabled={!ticketLabel.trim() || !ticketPrice}
                className="rounded-xl px-8"
              >
                {editingTicketId ? "Update" : "Add"} Ticket
              </Button>
            </div>
          </div>
        )}

        {ticketTypes.ticketTypes === undefined ? (
          <div className="space-y-3">
             <Skeleton className="h-20 w-full rounded-xl" />
             <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : ticketTypes.ticketTypes.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground rounded-2xl border border-dashed border-white/20 bg-white/5">
            <Ticket className="mx-auto mb-4 size-16 opacity-10" />
            <p className="text-sm font-bold tracking-widest uppercase opacity-40">No ticket types yet</p>
            <p className="text-xs mt-1">
              Add your first ticket type to start selling tickets.
            </p>
          </div>
        ) : (
          <DragDropProvider onDragEnd={handleTicketDragEnd}>
            <div className="space-y-3">
              {orderedTicketIds.map((ticketId: string, index: number) => {
                const ticket = ticketTypes.ticketTypes.find(
                  (item: any) => String(item._id) === ticketId
                )
                if (!ticket) return null
                return (
                  <TicketTypeRow
                    key={ticket._id}
                    ticket={ticket}
                    index={index}
                    eventCurrency={event.currency}
                    onEdit={startEditingTicket}
                    onDelete={handleDeleteTicket}
                  />
                )
              })}
            </div>
          </DragDropProvider>
        )}
      </CardContent>
    </Card>
  )
}
