"use client"

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
   BedDouble,
   Building2,
   Hotel,
   MapPin,
   Sparkles,
   Plus,
   RefreshCcw,
   ChevronLeft,
   ChevronRight,
   ArrowRight,
   Trash2,
   LayoutGrid,
   Info,
   CheckCircle2,
   X,
   Layers,
   ArrowLeft
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
   groupInventoryRoomsByRoomType,
   normalizeInventoryRoom,
} from "@/lib/dashboard/accommodation/inventory-metrics"

type InventoryPayload = {
   generatedAt: string
   availableEvents: Array<{
      providerEventId: string
      name: string | null
   }>
   hotels: Array<{
      id: string
      name: string
      city: string | null
      notes: string | null
      roomCount: number
      assignedEventIds: string[]
   }>
   roomTypes: Array<{
      id: string
      label: string
      defaultCapacity: number
      roomCount: number
   }>
   rooms: Array<{
      id: string
      label: string
      capacity: number
      occupiedBeds: number
      availableBeds: number
      availability: "empty" | "available" | "full"
      notes: string | null
      hotel: {
         id: string
         name: string
         city: string | null
      }
      roomType: {
         id: string
         label: string
         defaultCapacity: number
      }
   }>
   summary: {
      totalRooms: number
      emptyRooms: number
      availableRooms: number
      fullRooms: number
      unassignedAttendees: number
   }
}

type InventoryErrorState = {
   global: string | null
   hotels: string | null
   roomTypes: string | null
   rooms: string | null
   eventHotels: string | null
}

const emptyPayload: InventoryPayload = {
   generatedAt: new Date(0).toISOString(),
   availableEvents: [],
   hotels: [],
   roomTypes: [],
   rooms: [],
   summary: {
      totalRooms: 0,
      emptyRooms: 0,
      availableRooms: 0,
      fullRooms: 0,
      unassignedAttendees: 0,
   },
}

function emptyErrors(): InventoryErrorState {
   return {
      global: null,
      hotels: null,
      roomTypes: null,
      rooms: null,
      eventHotels: null,
   }
}

function normalizeInventoryPayload(payload: InventoryPayload): InventoryPayload {
   return {
      ...payload,
      rooms: payload.rooms.map((room) => normalizeInventoryRoom(room)),
   }
}

export default function RoomInventoryPage() {
   const [payload, setPayload] = useState<InventoryPayload>(emptyPayload)
   const [errors, setErrors] = useState<InventoryErrorState>(emptyErrors)
   const [isLoading, setIsLoading] = useState(true)
   const [isMutating, setIsMutating] = useState(false)
   const [deletingHotelId, setDeletingHotelId] = useState<string | null>(null)
   const [hotelDeleteErrors, setHotelDeleteErrors] = useState<Record<string, string>>({})
   const [deletingRoomTypeId, setDeletingRoomTypeId] = useState<string | null>(null)
   const [roomTypeDeleteErrors, setRoomTypeDeleteErrors] = useState<Record<string, string>>({})

   const [hotelName, setHotelName] = useState("")
   const [hotelCity, setHotelCity] = useState("")
   const [roomTypeLabel, setRoomTypeLabel] = useState("")
   const [roomTypeCapacity, setRoomTypeCapacity] = useState("2")
   const [roomHotelId, setRoomHotelId] = useState("")
   const [roomTypeId, setRoomTypeId] = useState("")
   const [roomQuantity, setRoomQuantity] = useState("1")
   const [manualRoomLabels, setManualRoomLabels] = useState("")

   // Multi-step form state
   const [isRegisterInventoryOpen, setIsRegisterInventoryOpen] = useState(false)
   const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

   const [activeHotelScopeId, setActiveHotelScopeId] = useState<string | null>(null)
   const [draftEventIds, setDraftEventIds] = useState<string[]>([])

   const loadInventory = useCallback(async () => {
      setIsLoading(true)
      setErrors((current) => ({ ...current, global: null }))
      try {
         const response = await fetch("/api/dashboard/accommodation/inventory")
         const body = await response.json()
         if (!response.ok) throw new Error(body.error?.message || "Failed to load")
         setPayload(normalizeInventoryPayload(body))
      } catch (e: any) {
         setErrors((current) => ({ ...current, global: e.message }))
      } finally {
         setIsLoading(false)
      }
   }, [])

   useEffect(() => { loadInventory() }, [loadInventory])

   useEffect(() => {
      if (!roomHotelId && payload.hotels[0]) setRoomHotelId(payload.hotels[0].id)
      if (!roomTypeId && payload.roomTypes[0]) setRoomTypeId(payload.roomTypes[0].id)
   }, [payload.hotels, payload.roomTypes, roomHotelId, roomTypeId])

   const totalCapacity = useMemo(() => payload.rooms.reduce((acc, r) => acc + r.capacity, 0), [payload.rooms])
   const occupiedCapacity = useMemo(() => payload.rooms.reduce((acc, r) => acc + r.occupiedBeds, 0), [payload.rooms])
   const capacityUtilization = totalCapacity > 0 ? Math.round((occupiedCapacity / totalCapacity) * 100) : 0

   const openHotelScopeModal = (hotelId: string) => {
      const hotel = payload.hotels.find((h) => h.id === hotelId)
      setDraftEventIds(hotel?.assignedEventIds ?? [])
      setActiveHotelScopeId(hotelId)
   }

   const closeHotelScopeModal = () => {
      setActiveHotelScopeId(null)
      setDraftEventIds([])
      setErrors((current) => ({ ...current, eventHotels: null }))
   }

   const saveHotelScope = async () => {
      if (!activeHotelScopeId) return
      setIsMutating(true)
      try {
         const response = await fetch(`/api/dashboard/accommodation/hotels/${activeHotelScopeId}/events`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventIds: draftEventIds }),
         })
         if (!response.ok) throw new Error("Failed to update scope")
         await loadInventory()
         closeHotelScopeModal()
      } catch (e: any) {
         setErrors((current) => ({ ...current, eventHotels: e.message }))
      } finally {
         setIsMutating(false)
      }
   }

   const submitHotel = async (e: FormEvent) => {
      e.preventDefault()
      if (!hotelName.trim()) return
      setIsMutating(true)
      try {
         const resp = await fetch("/api/dashboard/accommodation/hotels", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: hotelName, city: hotelCity }),
         })
         if (!resp.ok) throw new Error("Failed to create hotel")
         setHotelName(""); setHotelCity("")
         await loadInventory()
         setCurrentStep(2)
      } catch (e: any) {
         setErrors((current) => ({ ...current, hotels: e.message }))
      } finally { setIsMutating(false) }
   }

   const submitRoomType = async (e: FormEvent) => {
      e.preventDefault()
      if (!roomTypeLabel.trim()) return
      setIsMutating(true)
      try {
         const resp = await fetch("/api/dashboard/accommodation/room-types", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: roomTypeLabel, defaultCapacity: Number(roomTypeCapacity) }),
         })
         if (!resp.ok) throw new Error("Failed to create type")
         setRoomTypeLabel(""); setRoomTypeCapacity("2")
         await loadInventory()
         setCurrentStep(3)
      } catch (e: any) {
         setErrors((current) => ({ ...current, roomTypes: e.message }))
      } finally { setIsMutating(false) }
   }

   const submitRoom = async (e: FormEvent) => {
      e.preventDefault()
      if (!roomHotelId || !roomTypeId) return
      setIsMutating(true)
      try {
         const resp = await fetch("/api/dashboard/accommodation/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               hotelId: roomHotelId,
               roomTypeId,
               quantity: Number(roomQuantity),
               labels: manualRoomLabels.split("\n").map(l => l.trim()).filter(Boolean),
            }),
         })
         if (!resp.ok) throw new Error("Failed to create rooms")
         setRoomQuantity("1"); setManualRoomLabels("")
         await loadInventory()
         setIsRegisterInventoryOpen(false)
         setCurrentStep(1)
      } catch (e: any) {
         setErrors((current) => ({ ...current, rooms: e.message }))
      } finally { setIsMutating(false) }
   }

   const deleteHotel = async (id: string, name: string) => {
      if (!window.confirm(`Delete hotel "${name}"?`)) return
      setDeletingHotelId(id)
      try {
         const resp = await fetch(`/api/dashboard/accommodation/hotels/${id}`, { method: "DELETE" })
         if (!resp.ok) throw new Error("Delete failed")
         await loadInventory()
      } catch (e: any) {
         setHotelDeleteErrors(c => ({ ...c, [id]: e.message }))
      } finally { setDeletingHotelId(null) }
   }

   const deleteRoomType = async (id: string, label: string) => {
      if (!window.confirm(`Delete room type "${label}"?`)) return
      setDeletingRoomTypeId(id)
      try {
         const resp = await fetch(`/api/dashboard/accommodation/room-types/${id}`, { method: "DELETE" })
         if (!resp.ok) throw new Error("Delete failed")
         await loadInventory()
      } catch (err: any) {
         setRoomTypeDeleteErrors(c => ({ ...c, [id]: err.message }))
      } finally { setDeletingRoomTypeId(null) }
   }

   return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-12">
         {/* Premium Header */}
         <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between px-1">
            <div>
               <div className="flex items-center gap-2 mb-1">
                  <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                     INV
                  </span>
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase py-0.5">Global Repository</p>
               </div>
               <h1 className="text-3xl font-bold tracking-tight text-foreground">Inventory Center</h1>
               <p className="text-muted-foreground mt-1 text-sm font-medium">Coordinate venue logistics, room specifications and estate stock.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               <Button variant="outline" size="sm" asChild className="rounded-lg h-10 border-border/50 bg-card/40 backdrop-blur font-bold text-xs shadow-sm">
                  <Link href="/dashboard/accommodation">
                     <ChevronLeft className="mr-2 size-3.5" /> Back to Allocation
                  </Link>
               </Button>
               <Button onClick={() => { setCurrentStep(1); setIsRegisterInventoryOpen(true); }} size="sm" className="rounded-lg h-10 bg-primary text-white font-bold text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
                  <Plus className="mr-2 size-3.5" /> Register Inventory
               </Button>
               <Button onClick={() => loadInventory()} variant="ghost" size="icon" className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors">
                  <RefreshCcw className={cn("size-4", isLoading && "animate-spin")} />
               </Button>
            </div>
         </header>

         {/* Hero Analytics */}
         <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-sm overflow-hidden relative group">
               <div className="absolute -right-4 -top-4 size-24 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
               <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Total Estate</p>
               <div className="mt-4 flex items-baseline gap-2">
                  {isLoading ? (
                     <Skeleton className="h-10 w-24 rounded-lg" />
                  ) : (
                     <>
                        <span className="text-4xl font-black tracking-tight">{payload.summary.totalRooms}</span>
                        <span className="text-xs font-bold text-muted-foreground/60 tracking-wider">ROOMS</span>
                     </>
                  )}
               </div>
            </article>

            <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-sm overflow-hidden relative group">
               <div className="absolute -right-4 -top-4 size-24 rounded-full bg-indigo-500/5 blur-2xl transition-all group-hover:bg-indigo-500/10" />
               <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Active Capacity</p>
               <div className="mt-4 flex items-baseline gap-2">
                  {isLoading ? (
                     <Skeleton className="h-10 w-24 rounded-lg" />
                  ) : (
                     <span className="text-4xl font-black tracking-tight text-indigo-500">{capacityUtilization}%</span>
                  )}
               </div>
               <div className="mt-4 flex flex-col gap-2">
                  <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                     <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${capacityUtilization}%` }} />
                  </div>
                  <p className="text-[10px] font-medium text-muted-foreground/60">{occupiedCapacity} of {totalCapacity} beds taken</p>
               </div>
            </article>

            <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-sm overflow-hidden relative group">
               <div className="absolute -right-4 -top-4 size-24 rounded-full bg-amber-500/5 blur-2xl transition-all group-hover:bg-amber-500/10" />
               <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Ready Supply</p>
               <div className="mt-4 flex items-baseline gap-2">
                  {isLoading ? (
                     <Skeleton className="h-10 w-24 rounded-lg" />
                  ) : (
                     <span className="text-4xl font-black tracking-tight text-amber-500">{payload.summary.emptyRooms}</span>
                  )}
               </div>
            </article>

            <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-sm overflow-hidden relative group">
               <div className="absolute -right-4 -top-4 size-24 rounded-full bg-rose-500/5 blur-2xl transition-all group-hover:bg-rose-500/10" />
               <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Spec Diversity</p>
               <div className="mt-4 flex items-baseline gap-2">
                  {isLoading ? (
                     <Skeleton className="h-10 w-24 rounded-lg" />
                  ) : (
                     <span className="text-4xl font-black tracking-tight text-rose-500">{payload.roomTypes.length}</span>
                  )}
               </div>
            </article>
         </section>

         {/* Live Estate View */}
         <section className="grid gap-8 lg:grid-cols-3">
            {/* Main Estate Column */}
            <div className="lg:col-span-2 space-y-8">
               <div className="flex items-center justify-between px-1">
                  <h3 className="text-xl font-bold tracking-tight">Active Estate</h3>
                  <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                     <span className="flex items-center gap-1.5"><div className="size-1.5 rounded-full bg-emerald-500" /> Operational</span>
                     <span className="flex items-center gap-1.5"><div className="size-1.5 rounded-full bg-amber-500" /> Partially Full</span>
                  </div>
               </div>

               {isLoading ? (
                  <div className="space-y-6">
                     {[1, 2].map(i => <Skeleton key={i} className="h-[300px] w-full rounded-xl" />)}
                  </div>
               ) : payload.hotels.length === 0 ? (
                  <article className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-12 text-center">
                     <Building2 className="size-12 text-muted-foreground/20 mx-auto mb-4" />
                     <h4 className="text-lg font-bold text-muted-foreground/60">No venues synchronized</h4>
                     <p className="text-sm text-muted-foreground/40 mt-1">Start by registering your first hotel property.</p>
                  </article>
               ) : (
                  <div className="space-y-6">
                     {payload.hotels.map((hotel) => {
                        const hotelRooms = payload.rooms.filter(r => r.hotel.id === hotel.id)
                        const grouped = groupInventoryRoomsByRoomType(hotelRooms)
                        return (
                           <article key={hotel.id} className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden shadow-sm transition-all hover:border-primary/20">
                              <div className="border-b border-border/30 bg-muted/40 p-6 flex items-center justify-between">
                                 <div className="flex items-center gap-4">
                                    <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                       <Hotel className="size-6" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                       <h4 className="text-lg font-black tracking-tight">{hotel.name}</h4>
                                       <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                          <MapPin className="size-3" /> {hotel.city || "Not set"} · {hotelRooms.length} Units configured
                                       </p>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => openHotelScopeModal(hotel.id)} className="rounded-lg text-primary hover:bg-primary/5">
                                       <RefreshCcw className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" disabled={deletingHotelId === hotel.id} onClick={() => deleteHotel(hotel.id, hotel.name)} className="rounded-lg text-rose-500 hover:bg-rose-500/5 hover:text-rose-600">
                                       <Trash2 className="size-4" />
                                    </Button>
                                 </div>
                              </div>
                              <div className="p-6">
                                 {hotelRooms.length === 0 ? (
                                    <p className="text-[10px] font-bold text-muted-foreground/40 italic uppercase tracking-widest text-center py-8">No room blocks defined</p>
                                 ) : (
                                    <div className="grid gap-3">
                                       {grouped.map((block) => (
                                          <div key={block.roomTypeLabel} className="group flex items-center justify-between p-4 rounded-lg bg-background/40 border border-border/20 transition-all hover:bg-background/60">
                                             <div className="flex items-center gap-4">
                                                <div className="size-8 rounded-lg bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center text-indigo-500/50">
                                                   <BedDouble className="size-4" />
                                                </div>
                                                <div>
                                                   <p className="text-sm font-black text-foreground">{block.roomTypeLabel}</p>
                                                   <p className="text-[10px] font-bold text-muted-foreground/50 uppercase">{block.quantity} ROOMS</p>
                                                </div>
                                             </div>
                                             <div className="flex items-center gap-8">
                                                <div className="text-center">
                                                   <p className="text-[9px] font-black uppercase text-muted-foreground/40">Capacity</p>
                                                   <p className="text-xs font-bold">{block.totalBeds}</p>
                                                </div>
                                                <div className="text-center">
                                                   <p className="text-[9px] font-black uppercase text-muted-foreground/40 tracking-wider">Occupied</p>
                                                   <p className={cn("text-xs font-bold", block.occupiedBeds >= block.totalBeds ? "text-rose-500" : "text-amber-600")}>{block.occupiedBeds}</p>
                                                </div>
                                                <div className="text-center">
                                                   <p className="text-[9px] font-black uppercase text-muted-foreground/40">Available</p>
                                                   <p className="text-xs font-bold text-emerald-600">{block.availableBeds}</p>
                                                </div>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 )}
                                 {hotelDeleteErrors[hotel.id] && <p className="mt-4 text-[10px] font-bold text-rose-500 bg-rose-500/5 border border-rose-500/10 p-2 rounded-lg">{hotelDeleteErrors[hotel.id]}</p>}
                              </div>
                           </article>
                        )
                     })}
                  </div>
               )}
            </div>

            {/* Side Spec Column */}
            <div className="space-y-8">
               <div className="flex items-center justify-between px-1">
                  <h3 className="text-xl font-bold tracking-tight">Catalogs</h3>
               </div>

               <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                     <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">Asset Templates</p>
                        <h4 className="text-sm font-black uppercase tracking-widest tracking-tight">Room Type Specs</h4>
                     </div>
                  </div>

                  <div className="grid gap-3">
                     {payload.roomTypes.length === 0 ? (
                        <p className="text-[10px] font-bold text-muted-foreground/30 italic text-center py-4 uppercase">No specs defined</p>
                     ) : payload.roomTypes.map(type => (
                        <div key={type.id} className="group flex items-center justify-between p-3.5 rounded-lg bg-background/40 border border-border/30 transition-all hover:bg-background/60">
                           <div>
                              <p className="text-xs font-black text-foreground">{type.label}</p>
                              <p className="text-[9px] font-bold text-muted-foreground/50 uppercase">{type.defaultCapacity}-Bed Capacity</p>
                           </div>
                           <Button variant="ghost" size="icon" disabled={deletingRoomTypeId === type.id} onClick={() => deleteRoomType(type.id, type.label)} className="size-7 rounded-md text-rose-300 opacity-20 group-hover:opacity-100 transition-opacity hover:bg-rose-500/10 hover:text-rose-500">
                              <Trash2 className="size-3.5" />
                           </Button>
                        </div>
                     ))}
                  </div>
               </article>
            </div>
         </section>

         {/* Multi-Step Provisioning Modal */}
         {isRegisterInventoryOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
               <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border/50 bg-card/60 shadow-2xl relative flex flex-col min-h-[500px]">

                  {/* Modal Header */}
                  <div className="p-8 pb-4 flex items-center justify-between border-b border-border/20">
                     <div className="flex items-center gap-4">
                        <div className={cn(
                           "size-10 rounded-xl flex items-center justify-center transition-all",
                           currentStep === 1 ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" :
                              currentStep === 2 ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" :
                                 "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                        )}>
                           {currentStep === 1 ? <Hotel className="size-5" /> : currentStep === 2 ? <Sparkles className="size-5" /> : <BedDouble className="size-5" />}
                        </div>
                        <div>
                           <h2 className="text-xl font-black tracking-tight">Provision Inventory</h2>
                           <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Phase {currentStep} of 3</p>
                        </div>
                     </div>
                     <Button variant="ghost" size="icon" onClick={() => setIsRegisterInventoryOpen(false)} className="rounded-full text-muted-foreground/40 hover:text-foreground">
                        <X className="size-5" />
                     </Button>
                  </div>

                  {/* Step Progress Bar */}
                  <div className="px-8 pt-6 flex items-center gap-2">
                     {[1, 2, 3].map((step) => (
                        <div key={step} className={cn(
                           "h-1.5 flex-1 rounded-full transition-all duration-500",
                           currentStep >= step ? (
                              step === 1 ? "bg-indigo-500" : step === 2 ? "bg-rose-500" : "bg-emerald-500"
                           ) : "bg-muted/40"
                        )} />
                     ))}
                  </div>

                  {/* Form Content Area */}
                  <div className="flex-1 p-8">
                     {currentStep === 1 && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                           <div className="space-y-2">
                              <h3 className="text-lg font-black tracking-tight">Identify the Property</h3>
                              <p className="text-sm text-muted-foreground font-medium">Create a new hotel or venue entry in the global registry.</p>
                           </div>
                           <form onSubmit={submitHotel} className="space-y-5">
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Venue Name</label>
                                 <input autoFocus value={hotelName} onChange={e => setHotelName(e.target.value)} placeholder="e.g. Grand Plaza Executive..." className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-indigo-500/20" />
                              </div>
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">City / Locale</label>
                                 <input value={hotelCity} onChange={e => setHotelCity(e.target.value)} placeholder="e.g. Lagos, Nigeria..." className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-indigo-500/20" />
                              </div>
                              {errors.hotels && <p className="text-[10px] text-rose-500 font-bold uppercase p-2 bg-rose-500/5 rounded-lg border border-rose-500/10">{errors.hotels}</p>}
                           </form>
                           <div className="flex items-center gap-3 pt-4">
                              {payload.hotels.length > 0 && (
                                 <Button variant="ghost" className="rounded-lg h-12 px-6 font-bold text-xs uppercase text-muted-foreground" onClick={() => setCurrentStep(2)}>Skip to Templates</Button>
                              )}
                              <Button disabled={isMutating || !hotelName.trim()} onClick={submitHotel} className="flex-1 h-12 rounded-lg bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20">
                                 Create & Continue <ChevronRight className="ml-2 size-4" />
                              </Button>
                           </div>
                        </div>
                     )}

                     {currentStep === 2 && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                           <div className="space-y-2">
                              <h3 className="text-lg font-black tracking-tight text-rose-500">Define the Spec</h3>
                              <p className="text-sm text-muted-foreground font-medium">Create a reusable room blueprint with specific bed capacity.</p>
                           </div>
                           <form onSubmit={submitRoomType} className="space-y-5">
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Type Label</label>
                                 <input autoFocus value={roomTypeLabel} onChange={e => setRoomTypeLabel(e.target.value)} placeholder="e.g. Executive Platinum Double..." className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-rose-500/20" />
                              </div>
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Bed Capacity</label>
                                 <div className="flex items-center gap-4">
                                    <input type="range" min="1" max="10" value={roomTypeCapacity} onChange={e => setRoomTypeCapacity(e.target.value)} className="flex-1 accent-rose-500" />
                                    <span className="size-12 flex items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 font-black text-lg border border-rose-500/20">{roomTypeCapacity}</span>
                                 </div>
                              </div>
                              {errors.roomTypes && <p className="text-[10px] text-rose-500 font-bold uppercase p-2 bg-rose-500/5 rounded-lg border border-rose-500/10">{errors.roomTypes}</p>}
                           </form>
                           <div className="flex items-center gap-3 pt-4">
                              <Button variant="ghost" size="icon" className="h-12 w-12 rounded-lg text-muted-foreground" onClick={() => setCurrentStep(1)}>
                                 <ArrowLeft className="size-4" />
                              </Button>
                              {payload.roomTypes.length > 0 && payload.hotels.length > 0 && (
                                 <Button variant="ghost" className="rounded-lg h-12 px-6 font-bold text-xs uppercase text-muted-foreground" onClick={() => setCurrentStep(3)}>Skip to Stock</Button>
                              )}
                              <Button disabled={isMutating || !roomTypeLabel.trim()} onClick={submitRoomType} className="flex-1 h-12 rounded-lg bg-rose-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20">
                                 Save Template <ChevronRight className="ml-2 size-4" />
                              </Button>
                           </div>
                        </div>
                     )}

                     {currentStep === 3 && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                           <div className="space-y-2">
                              <h3 className="text-lg font-black tracking-tight text-emerald-500">Provision Stock</h3>
                              <p className="text-sm text-muted-foreground font-medium">Link a physical room block to a property using a template spec.</p>
                           </div>
                           <form onSubmit={submitRoom} className="space-y-5">
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Target Venue</label>
                                    <select value={roomHotelId} onChange={e => setRoomHotelId(e.target.value)} className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none">
                                       <option value="">Select Venue</option>
                                       {payload.hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                                    </select>
                                 </div>
                                 <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Spec Template</label>
                                    <select value={roomTypeId} onChange={e => setRoomTypeId(e.target.value)} className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none">
                                       <option value="">Select Spec</option>
                                       {payload.roomTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                 </div>
                              </div>
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Quantity / Labels</label>
                                 <textarea value={manualRoomLabels} onChange={e => setManualRoomLabels(e.target.value)} placeholder="Enter room names one per line (optional)..." className="flex min-h-[120px] w-full rounded-lg border border-border/40 bg-background/50 px-4 py-4 text-xs font-bold transition-all outline-none focus:ring-2 focus:ring-emerald-500/20" />
                                 <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest italic ml-1">Leave empty to auto-generate identifiers based on count.</p>
                              </div>
                              {errors.rooms && <p className="text-[10px] text-rose-500 font-bold uppercase p-2 bg-rose-500/5 rounded-lg border border-rose-500/10">{errors.rooms}</p>}
                           </form>
                           <div className="flex items-center gap-3 pt-4">
                              <Button variant="ghost" size="icon" className="h-12 w-12 rounded-lg text-muted-foreground" onClick={() => setCurrentStep(2)}>
                                 <ArrowLeft className="size-4" />
                              </Button>
                              <Button disabled={isMutating || !roomHotelId || !roomTypeId} onClick={submitRoom} className="flex-1 h-12 rounded-lg bg-emerald-600 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                                 Sync Stock Block <CheckCircle2 className="ml-2 size-4" />
                              </Button>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}

         {/* Scope Management Modal */}
         {activeHotelScopeId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl p-4 animate-in zoom-in-95 duration-300">
               <div className="w-full max-w-xl rounded-xl border border-border/50 bg-card/60 shadow-2xl p-8">
                  <div className="flex items-start justify-between mb-8">
                     <div>
                        <h3 className="text-xl font-black tracking-tight">{payload.hotels.find(h => h.id === activeHotelScopeId)?.name}</h3>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mt-1">Scope Reach Management</p>
                     </div>
                     <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Layers className="size-5" />
                     </div>
                  </div>

                  <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2">
                     {isLoading && payload.hotels.length === 0 ? (
                        <div className="grid gap-6">
                           {Array.from({ length: 2 }).map((_, i) => (
                              <div key={i} className="flex flex-col rounded-xl border border-border/40 bg-card/60 p-6 h-[340px]">
                                 <div className="flex items-center justify-between border-b border-border/10 pb-4">
                                    <div className="flex items-center gap-3">
                                       <Skeleton className="size-10 rounded-lg" />
                                       <div className="space-y-1.5">
                                          <Skeleton className="h-4 w-48 rounded-md" />
                                          <Skeleton className="h-3 w-32 rounded-md" />
                                       </div>
                                    </div>
                                    <Skeleton className="h-6 w-24 rounded-lg" />
                                 </div>
                                 <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {Array.from({ length: 4 }).map((_, j) => (
                                       <Skeleton key={j} className="h-32 rounded-xl" />
                                    ))}
                                 </div>
                              </div>
                           ))}
                        </div>
                     ) : payload.availableEvents.length === 0 ? (
                        <p className="text-sm font-bold text-muted-foreground italic text-center py-6">No events available</p>
                     ) : payload.availableEvents.map(event => {
                        const checked = draftEventIds.includes(event.providerEventId)
                        return (
                           <label key={event.providerEventId} className={cn(
                              "flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer",
                              checked ? "border-primary bg-primary/[0.03]" : "border-border/40 bg-background/40"
                           )}>
                              <div className="flex items-center gap-3">
                                 <div className={cn("size-4 rounded border flex items-center justify-center transition-colors", checked ? "bg-primary border-primary" : "border-muted-foreground/20")}>
                                    {checked && <CheckCircle2 className="size-3 text-white" />}
                                 </div>
                                 <span className="text-xs font-black tracking-tight">{event.name}</span>
                              </div>
                              <input
                                 type="checkbox"
                                 className="hidden"
                                 checked={checked}
                                 onChange={e => {
                                    setDraftEventIds(curr => e.target.checked ? [...curr, event.providerEventId] : curr.filter(id => id !== event.providerEventId))
                                 }}
                              />
                              <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">{event.providerEventId}</span>
                           </label>
                        )
                     })}
                  </div>

                  <div className="flex items-center gap-3">
                     <Button variant="outline" onClick={closeHotelScopeModal} className="flex-1 rounded-lg h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                     <Button onClick={saveHotelScope} disabled={isMutating} className="flex-1 rounded-lg h-11 bg-primary text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20">Sync Reach</Button>
                  </div>
                  {errors.eventHotels && <p className="mt-4 text-[10px] text-rose-500 font-bold uppercase text-center">{errors.eventHotels}</p>}
               </div>
            </div>
         )}
      </div>
   )
}

function metricValueLabel(value: number, suffix = "") {
   return `${value.toLocaleString()}${suffix}`
}
