"use client"

import { useState } from "react"
import { Banknote, Landmark, Link as LinkIcon, Loader2 } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

import {
  useUnassignedPayments,
  useAssignPaymentToOrder,
  useCreatePayment,
} from "@/lib/convex/hooks/payments"
import { Id, Doc } from "@/convex/_generated/dataModel"

interface AssignPaymentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  outstandingAmountMinor: number
  bookerName?: string
}

function formatMoney(amountMinor: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amountMinor / 100)
}

export function AssignPaymentSheet({
  open,
  onOpenChange,
  orderId,
  outstandingAmountMinor,
  bookerName,
}: AssignPaymentSheetProps) {
  const [activeTab, setActiveTab] = useState("link")

  // Hooks map perfectly to the backend endpoints verified in plan
  const unassignedPayments = useUnassignedPayments()
  const assignPayment = useAssignPaymentToOrder()
  const createPayment = useCreatePayment()

  const [isLinking, setIsLinking] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Form State for Log New
  const [source, setSource] = useState<"cash" | "bank_transfer">("cash")
  const [amountString, setAmountString] = useState(
    outstandingAmountMinor > 0 ? (outstandingAmountMinor / 100).toFixed(2) : ""
  )
  const [payerName, setPayerName] = useState(bookerName || "")
  const [notes, setNotes] = useState("")

  const handleLink = async (paymentId: Id<"payments">) => {
    setIsLinking(paymentId)
    try {
      await assignPayment({ paymentId, orderId: orderId as Id<"orders"> })
      onOpenChange(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLinking(null)
    }
  }

  const handleLogNew = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    try {
      const amountMinor = Math.round(parseFloat(amountString) * 100)

      await createPayment({
        source,
        payerName,
        amountMinor,
        paidAt: Date.now(),
        orderId,
        notes,
      })

      onOpenChange(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full !max-w-none data-[side=right]:!w-full data-[side=right]:sm:!max-w-none overflow-y-auto p-4">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl font-bold">Assign Payment</SheetTitle>
          <SheetDescription>
            Ledger deficit: <span className="font-bold text-foreground">{formatMoney(outstandingAmountMinor)}</span>
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="link">Link Existing</TabsTrigger>
            <TabsTrigger value="new">Log New</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4">
            {unassignedPayments === undefined ? (
              <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading unassigned payments...</div>
            ) : unassignedPayments.length === 0 ? (
              <div className="py-12 text-center rounded-2xl border border-dashed border-border/50 bg-muted/20">
                <p className="text-sm font-medium text-muted-foreground">No unassigned payments found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unassignedPayments.map((p: Doc<"payments">) => (
                  <div key={p._id} className="flex flex-col gap-3 rounded-xl border p-4 bg-background shadow-sm hover:border-primary/30 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-sm tracking-tight">{p.payerName || "Unknown Payer"}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="secondary" className="text-[9px] uppercase font-black tracking-widest">{p.source.replace("_", " ")}</Badge>
                          <span className="text-[10px] font-medium text-muted-foreground">{new Date(p.paidAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <p className="text-sm font-black font-mono tabular-nums">{formatMoney(p.amountMinor)}</p>
                    </div>
                    {(p.reference || p.notes) && <p className="text-xs text-muted-foreground italic truncate border-t pt-2 mt-1">{[p.reference, p.notes].filter(Boolean).join(" — ")}</p>}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLink(p._id)}
                      disabled={isLinking !== null}
                      className="w-full mt-2 font-bold uppercase tracking-wider text-[10px]"
                    >
                      {isLinking === p._id ? <Loader2 className="size-4 animate-spin" /> : <>
                        <LinkIcon className="size-3 mr-2" /> Link
                      </>}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="new">
            <form onSubmit={handleLogNew} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Payment Source</Label>
                  <Select value={source} onValueChange={(val: any) => setSource(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        <div className="flex items-center text-sm font-medium"><Banknote className="size-4 mr-2 text-emerald-500" /> Cash</div>
                      </SelectItem>
                      <SelectItem value="bank_transfer">
                        <div className="flex items-center text-sm font-medium"><Landmark className="size-4 mr-2 text-blue-500" /> Bank Transfer</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Amount (EUR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amountString}
                    onChange={(e) => setAmountString(e.target.value)}
                    required
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payer Name</Label>
                  <Input
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="E.g. John Doe"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Reference Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional details"
                  />
                </div>
              </div>

              <Button type="submit" disabled={isCreating} className="w-full font-bold uppercase tracking-wider text-[11px]">
                {isCreating ? <Loader2 className="size-4 animate-spin" /> : "Log New Payment"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
