"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { CheckCircle, Copy, ExternalLink, QrCode } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"

interface DonationTikkieSectionProps {
  tikkieUrl: string
  eventName: string
  amountMinor: number
  currency: string
}

export function DonationTikkieSection({
  tikkieUrl,
  eventName,
  amountMinor,
  currency,
}: DonationTikkieSectionProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(tikkieUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const amountLabel =
    amountMinor === 0
      ? "Give what you can — choose your own amount"
       : formatMoney(amountMinor, currency)

  return (
    <Card className="overflow-hidden border-none bg-card/40 p-1 shadow-2xl backdrop-blur-xl ring-1 ring-border/50">
      <div className="rounded-[calc(var(--radius)-1px)] bg-card/60 p-6 sm:p-8">
        <div className="flex flex-col gap-8 sm:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-4">
            <div className="group relative rounded-3xl border-2 border-primary/10 bg-white p-5 shadow-inner transition-colors hover:border-primary/20">
              <QRCodeSVG
                value={tikkieUrl}
                size={160}
                level="H"
                includeMargin={false}
                className="transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-white/0 opacity-0 transition-opacity group-hover:bg-white/5 group-hover:opacity-100">
                <QrCode className="h-8 w-8 text-primary/20" />
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
              Scan to Give
            </p>
          </div>

          <div className="flex flex-1 flex-col justify-center space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                Donation
              </div>
              <h3 className="text-2xl font-black tracking-tight text-foreground">
                Support {eventName}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Give with Tikkie to <strong>{eventName}</strong>. Donations are
                recorded as standalone donations. Scan the QR code or use the
                link below.
              </p>
            </div>

            <div className="space-y-1 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                {amountMinor === 0 ? "Open amount" : "Amount"}
              </p>
              <p className="text-base font-black text-foreground">
                {amountLabel}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 overflow-hidden rounded-xl border border-border/50 bg-muted/30 p-1 pr-3">
                <code className="flex-1 truncate px-3 text-xs font-medium text-muted-foreground">
                  {tikkieUrl}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={copied ? "Copied donation link" : "Copy donation link"}
                  onClick={handleCopy}
                  className="h-8 w-8 shrink-0 rounded-lg hover:bg-primary/10"
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <Button
                asChild
                className="h-12 w-full rounded-xl bg-primary text-sm font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <a
                  href={tikkieUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Tikkie
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
