"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SignupDraft } from "@/components/signup/state"

type BuyerDetailsStepProps = {
  booker: SignupDraft["booker"]
  onBookerChange: (field: keyof SignupDraft["booker"], value: string) => void
  errors?: { name?: string; email?: string; phone?: string }
  onFieldBlur?: (field: keyof SignupDraft["booker"]) => void
}

export function BuyerDetailsStep({
  booker,
  onBookerChange,
  errors = {},
  onFieldBlur,
}: BuyerDetailsStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 md:gap-3">
        <div className="space-y-1 md:col-span-2">
          <Label>Full Name *</Label>
          <Input
            value={booker.name}
            onChange={(event) =>
              onBookerChange("name", event.currentTarget.value)
            }
            onBlur={() => onFieldBlur?.("name")}
            placeholder="Enter your full name"
            aria-invalid={!!errors.name}
          />
          {errors.name ? (
            <p className="text-sm text-destructive">{errors.name}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label>Email Address *</Label>
          <Input
            type="email"
            value={booker.email}
            onChange={(event) =>
              onBookerChange("email", event.currentTarget.value)
            }
            onBlur={() => onFieldBlur?.("email")}
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
          />
          {errors.email ? (
            <p className="text-sm text-destructive">{errors.email}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label>Phone Number *</Label>
          <Input
            type="tel"
            value={booker.phone}
            onChange={(event) =>
              onBookerChange("phone", event.currentTarget.value)
            }
            onBlur={() => onFieldBlur?.("phone")}
            placeholder="+31 6 12345678"
            aria-invalid={!!errors.phone}
          />
          {errors.phone ? (
            <p className="text-sm text-destructive">{errors.phone}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
