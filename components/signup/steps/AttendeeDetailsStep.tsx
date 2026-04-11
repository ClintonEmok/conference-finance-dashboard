"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AttendeeDraft } from "@/components/signup/state"
import type { SignupAttendeeValidationSummary } from "@/components/signup/validation"

type AttendeeDetailsStepProps = {
  attendees: AttendeeDraft[]
  validationSummary: SignupAttendeeValidationSummary | null
  onAttendeeChange: (
    attendeeKey: string,
    field: keyof AttendeeDraft,
    value: string
  ) => void
  onFieldBlur?: (attendeeKey: string, field: keyof AttendeeDraft) => void
}

function fieldLabel(field: string) {
  if (field === "name") return "name"
  if (field === "gender") return "gender"
  return field
}

function hasFieldError(
  validationSummary: SignupAttendeeValidationSummary | null,
  attendeeKey: string,
  field: string
) {
  return validationSummary?.byAttendee[attendeeKey]?.includes(field) ?? false
}

export function AttendeeDetailsStep({
  attendees,
  validationSummary,
  onAttendeeChange,
  onFieldBlur,
}: AttendeeDetailsStepProps) {
  const hasSummaryErrors =
    validationSummary !== null &&
    Object.values(validationSummary.byAttendee).some(
      (missing) => missing.length > 0
    )

  return (
    <div className="space-y-4">
      {hasSummaryErrors ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">
            Complete required attendee fields before review.
          </p>
          <ul className="mt-5 list-disc space-y-1 pl-5">
            {attendees.map((attendee, index) => {
              const missingFields =
                validationSummary?.byAttendee[attendee.attendeeKey] ?? []
              if (missingFields.length === 0) {
                return null
              }

              return (
                <li key={attendee.attendeeKey}>
                  Attendee {index + 1}:{" "}
                  {missingFields.map(fieldLabel).join(", ")}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {attendees.map((attendee, index) => (
        <Card key={attendee.attendeeKey} className="mt-5">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">Attendee {index + 1}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Selected ticket
              </span>
              <Badge variant="secondary" className="h-6 rounded-full px-2.5">
                {attendee.ticketLabel || "Unassigned"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 md:gap-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input
                aria-invalid={hasFieldError(
                  validationSummary,
                  attendee.attendeeKey,
                  "name"
                )}
                value={attendee.name}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "name",
                    event.currentTarget.value
                  )
                }
                onBlur={() => onFieldBlur?.(attendee.attendeeKey, "name")}
              />
              {hasFieldError(
                validationSummary,
                attendee.attendeeKey,
                "name"
              ) ? (
                <p className="text-xs text-destructive">Name is required.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={attendee.email}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "email",
                    event.currentTarget.value
                  )
                }
                onBlur={() => onFieldBlur?.(attendee.attendeeKey, "email")}
              />
            </div>

            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={attendee.phone}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "phone",
                    event.currentTarget.value
                  )
                }
                onBlur={() => onFieldBlur?.(attendee.attendeeKey, "phone")}
              />
            </div>

            <div className="space-y-1">
              <Label>Gender *</Label>
              <select
                aria-invalid={hasFieldError(
                  validationSummary,
                  attendee.attendeeKey,
                  "gender"
                )}
                value={attendee.gender}
                className="touch:text-base h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "gender",
                    event.currentTarget.value
                  )
                }
                onBlur={() => onFieldBlur?.(attendee.attendeeKey, "gender")}
              >
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
              {hasFieldError(
                validationSummary,
                attendee.attendeeKey,
                "gender"
              ) ? (
                <p className="text-xs text-destructive">Gender is required.</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Location</Label>
              <select
                value={attendee.location}
                className="touch:text-base h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "location",
                    event.currentTarget.value
                  )
                }
                onBlur={() => onFieldBlur?.(attendee.attendeeKey, "location")}
              >
                <option value="">Select location</option>
                <option value="Eindhoven">Eindhoven</option>
                <option value="Den Haag">Den Haag</option>
                <option value="Amsterdam">Amsterdam</option>
                <option value="Poland">Poland</option>
                <option value="Czech">Czech</option>
                <option value="Hungary">Hungary</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label>Dietary restrictions</Label>
              <Input
                value={attendee.dietaryRestrictions}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "dietaryRestrictions",
                    event.currentTarget.value
                  )
                }
                onBlur={() =>
                  onFieldBlur?.(attendee.attendeeKey, "dietaryRestrictions")
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Roommate preference</Label>
              <Input
                value={attendee.roommatePreference}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "roommatePreference",
                    event.currentTarget.value
                  )
                }
                onBlur={() =>
                  onFieldBlur?.(attendee.attendeeKey, "roommatePreference")
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
