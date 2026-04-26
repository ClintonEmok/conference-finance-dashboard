"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { AssignDialog } from "@/components/payments/assign-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  useAutoMatchPayments,
  useUnassignedPayments,
} from "@/lib/convex/hooks/payments"
import { formatMoney } from "@/lib/format"
import { maskPaymentPayer } from "@/lib/utils/privacy"
import type { Doc } from "@/convex/_generated/dataModel"

type AssignablePayment = Pick<
  Doc<"payments">,
  | "_id"
  | "source"
  | "payerName"
  | "payerAccountNumber"
  | "amountMinor"
  | "paidAt"
  | "reference"
  | "notes"
>

function formatDate(value: number) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function paymentSourceLabel(source: AssignablePayment["source"]) {
  if (source === "bank_transfer") return "Bank transfer"
  if (source === "cash") return "Cash"
  return "Tikkie"
}

type EventFinanceAssignmentSectionProps = {
  eventId: string
  eventTitle?: string | null
}

export function EventFinanceAssignmentSection({
  eventId,
  eventTitle,
}: EventFinanceAssignmentSectionProps) {
  const [selectedPayment, setSelectedPayment] =
    useState<AssignablePayment | null>(null)
  const [isAutoMatching, setIsAutoMatching] = useState(false)

  const payments = useUnassignedPayments()
  const autoMatchPayments = useAutoMatchPayments()

  const unassignedPayments: AssignablePayment[] = payments ?? []

  async function handleAutoMatch() {
    setIsAutoMatching(true)
    try {
      await autoMatchPayments({ eventId })
    } finally {
      setIsAutoMatching(false)
    }
  }

  return (
    <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Assignment</CardTitle>
          <CardDescription>
            Match unassigned payments to orders for {eventTitle ?? "this event"}
            .
          </CardDescription>
        </div>
        <Button
          variant="outline"
          onClick={() => void handleAutoMatch()}
          disabled={isAutoMatching || payments === undefined}
        >
          {isAutoMatching ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          Auto-match
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {payments === undefined ? (
          <p className="text-sm text-muted-foreground">
            Loading unassigned payments...
          </p>
        ) : unassignedPayments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            No unassigned payments right now.
          </div>
        ) : (
          <div className="grid gap-3">
            {unassignedPayments.map((payment) => (
              <div
                key={payment._id}
                className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold tracking-tight">
                        {(payment.payerName)}
                      </p>
                      <Badge
                        variant="secondary"
                        className="text-[10px] tracking-[0.18em] uppercase"
                      >
                        {paymentSourceLabel(payment.source)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(payment.paidAt)}
                    </p>
                    {(payment.reference || payment.notes) && (
                      <p className="text-sm text-muted-foreground">
                        {[payment.reference, payment.notes]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <p className="font-mono text-lg font-semibold tabular-nums">
                      {formatMoney(payment.amountMinor)}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedPayment(payment)}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {selectedPayment ? (
        <AssignDialog
          payment={{
            id: selectedPayment._id,
            source: selectedPayment.source,
            payerName: selectedPayment.payerName,
            payerAccountNumber: selectedPayment.payerAccountNumber ?? null,
            amountMinor: selectedPayment.amountMinor,
            paidAt: new Date(selectedPayment.paidAt).toISOString(),
          }}
          open={!!selectedPayment}
          onOpenChange={(open) => {
            if (!open) setSelectedPayment(null)
          }}
          onAssigned={() => setSelectedPayment(null)}
        />
      ) : null}
    </Card>
  )
}
