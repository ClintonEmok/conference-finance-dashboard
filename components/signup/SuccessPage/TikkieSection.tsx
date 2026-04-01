"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Copy, ExternalLink } from "lucide-react"

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
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-6">
          <p className="text-sm text-amber-800">
            Payment link will be shared separately. Please check your email or
            contact the organizers.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-blue-200 bg-blue-25/50">
      <CardHeader>
        <CardTitle className="text-base">Complete Your Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Scan the QR code or use the link below to pay for{" "}
          <strong>{eventName}</strong>. You can pay any amount that covers your
          booking.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* QR Code */}
          <div className="shrink-0 rounded-lg border bg-white p-4">
            <QRCodeSVG value={tikkieUrl} size={160} />
          </div>

          {/* Link & Actions */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded px-2 py-1 text-xs text-muted-foreground">
                {tikkieUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <Button asChild className="w-full sm:w-auto">
              <a
                href={tikkieUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Pay Now
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
