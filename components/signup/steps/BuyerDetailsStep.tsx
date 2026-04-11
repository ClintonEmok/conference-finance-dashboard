"use client"

import { forwardRef, type ComponentPropsWithoutRef } from "react"
import PhoneInput from "react-phone-number-input"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SignupDraft } from "@/components/signup/state"

const PhoneField = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<"input">
>(function PhoneField(props, ref) {
  return <Input ref={ref} type="tel" autoComplete="tel" {...props} />
})

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
    <Card className="mt-5">
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
          <PhoneInput
            defaultCountry="NL"
            inputComponent={PhoneField}
            value={booker.phone}
            onChange={(value) => onBookerChange("phone", value ?? "")}
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
