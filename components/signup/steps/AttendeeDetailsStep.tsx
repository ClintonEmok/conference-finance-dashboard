"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AttendeeDraft } from "@/components/signup/state"

export type AttendeeValidationSummary = {
  isValid: boolean
  byAttendee: Record<string, string[]>
}

type AttendeeDetailsStepProps = {
  attendees: AttendeeDraft[]
  validationSummary: AttendeeValidationSummary | null
  onAttendeeChange: (
    attendeeKey: string,
    field: keyof AttendeeDraft,
    value: string
  ) => void
}

function fieldLabel(field: string) {
  if (field === "phone") return "phone"
  if (field === "gender") return "gender"
  if (field === "location") return "location"
  if (field === "dietaryRestrictions") return "dietary restrictions"
  if (field === "roommatePreference") return "roommate preference"
  if (field === "roommateAvoid") return "roommate avoid"
  return field
}

function hasFieldError(
  validationSummary: AttendeeValidationSummary | null,
  attendeeKey: string,
  field: string
) {
  return validationSummary?.byAttendee[attendeeKey]?.includes(field) ?? false
}

export function AttendeeDetailsStep({
  attendees,
  validationSummary,
  onAttendeeChange,
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
          <ul className="mt-2 list-disc space-y-1 pl-5">
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
        <Card key={attendee.attendeeKey}>
          <CardHeader>
            <CardTitle className="text-base">Attendee {index + 1}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={attendee.name}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "name",
                    event.currentTarget.value
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Email (optional)</Label>
              <Input
                value={attendee.email}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "email",
                    event.currentTarget.value
                  )
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Phone *</Label>
              <Input
                aria-invalid={hasFieldError(
                  validationSummary,
                  attendee.attendeeKey,
                  "phone"
                )}
                value={attendee.phone}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "phone",
                    event.currentTarget.value
                  )
                }
              />
              {hasFieldError(
                validationSummary,
                attendee.attendeeKey,
                "phone"
              ) ? (
                <p className="text-xs text-destructive">Phone is required.</p>
              ) : null}
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
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "gender",
                    event.currentTarget.value
                  )
                }
              >
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="mixed">Mixed</option>
                <option value="unknown">Unknown</option>
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
              <Label>Location *</Label>
              <Input
                aria-invalid={hasFieldError(
                  validationSummary,
                  attendee.attendeeKey,
                  "location"
                )}
                value={attendee.location}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "location",
                    event.currentTarget.value
                  )
                }
              />
              {hasFieldError(
                validationSummary,
                attendee.attendeeKey,
                "location"
              ) ? (
                <p className="text-xs text-destructive">
                  Location is required.
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Dietary restrictions *</Label>
              <Input
                aria-invalid={hasFieldError(
                  validationSummary,
                  attendee.attendeeKey,
                  "dietaryRestrictions"
                )}
                value={attendee.dietaryRestrictions}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "dietaryRestrictions",
                    event.currentTarget.value
                  )
                }
              />
              {hasFieldError(
                validationSummary,
                attendee.attendeeKey,
                "dietaryRestrictions"
              ) ? (
                <p className="text-xs text-destructive">
                  Dietary restrictions are required.
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Roommate preference *</Label>
              <Input
                aria-invalid={hasFieldError(
                  validationSummary,
                  attendee.attendeeKey,
                  "roommatePreference"
                )}
                value={attendee.roommatePreference}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "roommatePreference",
                    event.currentTarget.value
                  )
                }
              />
              {hasFieldError(
                validationSummary,
                attendee.attendeeKey,
                "roommatePreference"
              ) ? (
                <p className="text-xs text-destructive">
                  Roommate preference is required.
                </p>
              ) : null}
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Roommate avoid *</Label>
              <Input
                aria-invalid={hasFieldError(
                  validationSummary,
                  attendee.attendeeKey,
                  "roommateAvoid"
                )}
                value={attendee.roommateAvoid}
                onChange={(event) =>
                  onAttendeeChange(
                    attendee.attendeeKey,
                    "roommateAvoid",
                    event.currentTarget.value
                  )
                }
              />
              {hasFieldError(
                validationSummary,
                attendee.attendeeKey,
                "roommateAvoid"
              ) ? (
                <p className="text-xs text-destructive">
                  Roommate avoid is required.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
