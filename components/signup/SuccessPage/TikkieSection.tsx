"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { CheckCircle, Copy, ExternalLink, QrCode, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface TikkieSectionProps {
  tikkieUrl: string | null
  eventName: string
}

export function TikkieSection({ tikkieUrl, eventName }: TikkieSectionProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!tikkieUrl) return
    navigator.clipboard.writeText(tikkieUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!tikkieUrl) {
    return (
      <Card className="border-none bg-amber-500/10 shadow-lg backdrop-blur-md">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <Wallet className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Payment link will be shared separately. Please check your email or
            contact the organizers.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-none bg-card/40 p-1 shadow-2xl backdrop-blur-xl ring-1 ring-border/50">
      <div className="rounded-[calc(var(--radius)-1px)] bg-card/60 p-6 sm:p-8">
        <div className="flex flex-col gap-8 sm:flex-row">
          {/* QR Code Column */}
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
              Scan to Pay
            </p>
          </div>

          {/* Details Column */}
          <div className="flex flex-1 flex-col justify-center space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                Payment Required
              </div>
              <h3 className="text-2xl font-black tracking-tight text-foreground">
                Complete Your Payment
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Pay with Tikkie for <strong>{eventName}</strong>. Scan the QR code or use the link below to complete your registration.
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

              <Button asChild className="h-12 w-full rounded-xl bg-primary text-sm font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
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
