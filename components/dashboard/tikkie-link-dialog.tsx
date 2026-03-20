"use client"

import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { CalendarClock, Link2, WalletCards, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const TEXT_LIMIT = 35

export type TikkieLinkDialogValues = {
  amountMinor: number
  expiryDate: string
  description: string
  referenceId: string
}

export type TikkieLinkDialogDefaults = TikkieLinkDialogValues & {
  providerOrderId: string
  providerEventId: string
}

type TikkieLinkDialogProps = {
  open: boolean
  defaults: TikkieLinkDialogDefaults | null
  submitting?: boolean
  error?: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TikkieLinkDialogValues) => Promise<void> | void
}

type FormErrors = Partial<Record<keyof TikkieLinkDialogValues, string>>

function parseFutureDate(value: string) {
  const normalized = value.trim()
  const parsed = new Date(`${normalized}T23:59:59.999Z`)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.getTime() > Date.now() ? parsed : null
}

function validate(values: TikkieLinkDialogValues) {
  const errors: FormErrors = {}

  if (!Number.isInteger(values.amountMinor) || values.amountMinor <= 0) {
    errors.amountMinor = "Amount must be a positive whole-number cent value."
  }

  if (!values.description.trim()) {
    errors.description = "Description is required."
  } else if (values.description.trim().length > TEXT_LIMIT) {
    errors.description = `Description must stay within ${TEXT_LIMIT} characters.`
  }

  if (values.referenceId.trim().length > TEXT_LIMIT) {
    errors.referenceId = `Reference must stay within ${TEXT_LIMIT} characters.`
  }

  if (!parseFutureDate(values.expiryDate)) {
    errors.expiryDate = "Expiry date must be a real future date."
  }

  return errors
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

export function TikkieLinkDialog({
  open,
  defaults,
  submitting = false,
  error,
  onOpenChange,
  onSubmit,
}: TikkieLinkDialogProps) {
  const [values, setValues] = useState<TikkieLinkDialogValues>({
    amountMinor: defaults?.amountMinor ?? 0,
    expiryDate: defaults?.expiryDate ?? "",
    description: defaults?.description ?? "",
    referenceId: defaults?.referenceId ?? "",
  })
  const [errors, setErrors] = useState<FormErrors>({})

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpenChange, open, submitting])

  const amountPreview = useMemo(() => formatMoney(values.amountMinor || 0), [values.amountMinor])

  if (!open || !defaults) {
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextValues = {
      amountMinor: values.amountMinor,
      expiryDate: values.expiryDate.trim(),
      description: values.description.trim(),
      referenceId: values.referenceId.trim(),
    }
    const nextErrors = validate(nextValues)

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    await onSubmit(nextValues)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={() => !submitting && onOpenChange(false)} />
      <Card className="relative z-10 w-full max-w-2xl overflow-hidden border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.98))] shadow-[0_28px_90px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.98))]">
        <div className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.14),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.94))] px-5 py-4 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.94))]">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
                Tikkie operator check
              </p>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                  Generate a payment link without leaving the workflow.
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Review the amount, expiry date, and share text before the server creates the latest link for
                  this order.
                </p>
              </div>
            </div>

            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              <X className="size-4" />
              <span className="sr-only">Close dialog</span>
            </Button>
          </div>
        </div>

        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { label: "Order", value: defaults.providerOrderId, icon: Link2 },
              { label: "Event", value: defaults.providerEventId, icon: CalendarClock },
              { label: "Current amount", value: amountPreview, icon: WalletCards },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    <Icon className="size-3.5" />
                    {item.label}
                  </div>
                  <p className="mt-2 break-all text-sm font-medium text-slate-900 dark:text-slate-100">{item.value}</p>
                </div>
              )
            })}
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Amount in cents
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={values.amountMinor}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      amountMinor: Number.parseInt(event.target.value || "0", 10),
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-0 transition focus:border-cyan-500 dark:border-slate-800 dark:bg-slate-950"
                />
                {errors.amountMinor && <p className="text-xs text-rose-600 dark:text-rose-300">{errors.amountMinor}</p>}
              </label>

              <label className="space-y-2 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Expiry date
                </span>
                <input
                  type="date"
                  value={values.expiryDate}
                  onChange={(event) => setValues((current) => ({ ...current, expiryDate: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-0 transition focus:border-cyan-500 dark:border-slate-800 dark:bg-slate-950"
                />
                {errors.expiryDate && <p className="text-xs text-rose-600 dark:text-rose-300">{errors.expiryDate}</p>}
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <span>Description</span>
                <span>{values.description.trim().length}/{TEXT_LIMIT}</span>
              </div>
              <input
                type="text"
                value={values.description}
                maxLength={TEXT_LIMIT}
                onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-0 transition focus:border-cyan-500 dark:border-slate-800 dark:bg-slate-950"
              />
              {errors.description && <p className="text-xs text-rose-600 dark:text-rose-300">{errors.description}</p>}
            </label>

            <label className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <span>Reference ID</span>
                <span>{values.referenceId.trim().length}/{TEXT_LIMIT}</span>
              </div>
              <input
                type="text"
                value={values.referenceId}
                maxLength={TEXT_LIMIT}
                onChange={(event) => setValues((current) => ({ ...current, referenceId: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-0 transition focus:border-cyan-500 dark:border-slate-800 dark:bg-slate-950"
              />
              {errors.referenceId && <p className="text-xs text-rose-600 dark:text-rose-300">{errors.referenceId}</p>}
            </label>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 pt-4 sm:flex-row sm:items-center sm:justify-end dark:border-slate-800">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={submitting}>
                {submitting ? "Generating..." : "Generate Tikkie link"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
