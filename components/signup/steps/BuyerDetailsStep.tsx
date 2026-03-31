"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SignupDraft } from "@/components/signup/state"

type BuyerDetailsStepProps = {
  booker: SignupDraft["booker"]
  onBookerChange: (field: keyof SignupDraft["booker"], value: string) => void
}

export function BuyerDetailsStep({
  booker,
  onBookerChange,
}: BuyerDetailsStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Full Name *</Label>
          <Input
            value={booker.name}
            onChange={(event) =>
              onBookerChange("name", event.currentTarget.value)
            }
            placeholder="Enter your full name"
          />
        </div>

        <div className="space-y-1">
          <Label>Email Address *</Label>
          <Input
            type="email"
            value={booker.email}
            onChange={(event) =>
              onBookerChange("email", event.currentTarget.value)
            }
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <Label>Phone Number *</Label>
          <Input
            type="tel"
            value={booker.phone}
            onChange={(event) =>
              onBookerChange("phone", event.currentTarget.value)
            }
            placeholder="+31 6 12345678"
          />
        </div>
      </CardContent>
    </Card>
  )
}
