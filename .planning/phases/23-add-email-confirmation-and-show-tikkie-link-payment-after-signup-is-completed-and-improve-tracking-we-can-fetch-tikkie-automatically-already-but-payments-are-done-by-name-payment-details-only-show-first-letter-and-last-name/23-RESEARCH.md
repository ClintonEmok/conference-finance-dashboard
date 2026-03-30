# Phase 23 Research: Email Confirmation, Tikkie Links, and Privacy-Aware Payment Tracking

**Research Date:** 2026-03-31
**Phase:** 23 - Add email confirmation and show tikkie link (payment)

---

## 1. Email Infrastructure: Resend

### Overview

Resend is the recommended email infrastructure for this project based on the decision to use their generous free tier and good deliverability. Resend provides a modern email API with excellent TypeScript/Node.js SDK support and React Email integration.

### SDK Installation

```bash
npm install resend
# For React Email templates
npm install @react-email/components @react-email/render
```

### Environment Variables

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_FROM_NAME="Conference Finance"
```

### Basic Usage Pattern

```typescript
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

// Send with React component template
const { data, error } = await resend.emails.send({
  from: "Conference Finance <noreply@yourdomain.com>",
  to: ["user@example.com"],
  subject: "Your Booking Confirmation",
  react: EmailTemplate({ firstName: "John", bookingRef: "BK-20250331-ABC123" }),
})

if (error) {
  console.error("Email failed:", error)
  // Handle retry logic
}
```

### React Email Template Pattern

```tsx
// lib/email/templates/signup-confirmation.tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Button,
  Section,
} from "@react-email/components"

interface SignupConfirmationEmailProps {
  bookerName: string
  bookingRef: string
  eventName: string
  eventDate: string
  eventLocation: string
  tikkieUrl: string | null
  attendeeCount: number
  roomAssignments: Array<{
    roomType: string
    hotelName: string
    bedCount: number
  }>
  successPageUrl: string
}

export default function SignupConfirmationEmail({
  bookerName,
  bookingRef,
  eventName,
  eventDate,
  eventLocation,
  tikkieUrl,
  attendeeCount,
  roomAssignments,
  successPageUrl,
}: SignupConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your booking for {eventName} is confirmed</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            padding: "20px",
          }}
        >
          <Heading>Booking Confirmed!</Heading>
          <Text>Hi {bookerName},</Text>
          <Text>
            Your booking for <strong>{eventName}</strong> is confirmed.
          </Text>

          <Section
            style={{
              backgroundColor: "#f0f0f0",
              padding: "15px",
              borderRadius: "5px",
              margin: "20px 0",
            }}
          >
            <Text style={{ margin: 0 }}>
              <strong>Booking Reference:</strong> {bookingRef}
            </Text>
            <Text style={{ margin: "5px 0 0 0" }}>
              <strong>Date:</strong> {eventDate}
            </Text>
            <Text style={{ margin: "5px 0 0 0" }}>
              <strong>Location:</strong> {eventLocation}
            </Text>
          </Section>

          {tikkieUrl && (
            <Section>
              <Heading as="h2" style={{ fontSize: "18px" }}>
                Payment
              </Heading>
              <Text>Please complete your payment using the link below:</Text>
              <Button
                href={tikkieUrl}
                style={{
                  backgroundColor: "#0070f3",
                  color: "#ffffff",
                  padding: "12px 24px",
                  textDecoration: "none",
                  borderRadius: "5px",
                }}
              >
                Pay Now
              </Button>
            </Section>
          )}

          <Text style={{ marginTop: "30px", fontSize: "14px", color: "#666" }}>
            View your full booking details:{" "}
            <a href={successPageUrl}>{successPageUrl}</a>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
```

### Error Handling & Retry Strategy

```typescript
interface EmailSendResult {
  success: boolean
  emailId?: string
  error?: string
  retryable: boolean
}

async function sendEmailWithRetry(
  resend: Resend,
  params: Parameters<Resend["emails"]["send"]>[0],
  maxRetries = 3
): Promise<EmailSendResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await resend.emails.send(params)

      if (error) {
        // Check if error is retryable (network issues, rate limits)
        const retryable = isRetryableError(error)
        if (!retryable || attempt === maxRetries) {
          return { success: false, error: error.message, retryable }
        }

        // Exponential backoff
        await delay(Math.pow(2, attempt) * 1000)
        continue
      }

      return { success: true, emailId: data?.id, retryable: false }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      if (attempt === maxRetries) {
        return { success: false, error: errorMessage, retryable: true }
      }
      await delay(Math.pow(2, attempt) * 1000)
    }
  }

  return { success: false, error: "Max retries exceeded", retryable: true }
}

function isRetryableError(error: { statusCode?: number }): boolean {
  // Rate limits (429) and server errors (5xx) are retryable
  if (!error.statusCode) return true
  return error.statusCode === 429 || error.statusCode >= 500
}
```

---

## 2. Convex Background Actions for Async Email

### Pattern for Async Email Sending

Since email sending can be slow (network I/O) and may fail intermittently, it should be done in a Convex **action** (not a mutation) to avoid blocking the submission transaction.

```typescript
// convex/email.ts
"use node"

import { action, internalAction } from "./_generated/server"
import { v } from "convex/values"
import { Resend } from "resend"
import { render } from "@react-email/render"
import SignupConfirmationEmail from "../lib/email/templates/signup-confirmation"

const resend = new Resend(process.env.RESEND_API_KEY!)

export const sendSignupConfirmation = internalAction({
  args: {
    to: v.string(),
    bookerName: v.string(),
    bookingRef: v.string(),
    eventName: v.string(),
    eventDate: v.string(),
    eventLocation: v.string(),
    tikkieUrl: v.optional(v.string()),
    attendeeCount: v.number(),
    roomAssignments: v.array(
      v.object({
        roomType: v.string(),
        hotelName: v.string(),
        bedCount: v.number(),
      })
    ),
    successPageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Render React email to HTML
      const html = await render(
        SignupConfirmationEmail({
          bookerName: args.bookerName,
          bookingRef: args.bookerRef,
          eventName: args.eventName,
          eventDate: args.eventDate,
          eventLocation: args.eventLocation,
          tikkieUrl: args.tikkieUrl || null,
          attendeeCount: args.attendeeCount,
          roomAssignments: args.roomAssignments,
          successPageUrl: args.successPageUrl,
        })
      )

      const { data, error } = await resend.emails.send({
        from: `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`,
        to: [args.to],
        subject: `Booking Confirmed: ${args.eventName}`,
        html,
        text: generatePlainTextVersion(args), // Fallback for non-HTML clients
      })

      if (error) {
        console.error("Failed to send email:", error)
        // Log to a dead-letter table for manual review
        await ctx.runMutation(internal.email.logFailedEmail, {
          recipient: args.to,
          bookingRef: args.bookingRef,
          error: error.message,
          emailType: "signup_confirmation",
        })
        return { success: false, error: error.message }
      }

      // Log successful send
      await ctx.runMutation(internal.email.logSentEmail, {
        recipient: args.to,
        bookingRef: args.bookingRef,
        emailId: data?.id,
        emailType: "signup_confirmation",
      })

      return { success: true, emailId: data?.id }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      console.error("Email action threw:", err)

      await ctx.runMutation(internal.email.logFailedEmail, {
        recipient: args.to,
        bookingRef: args.bookingRef,
        error: message,
        emailType: "signup_confirmation",
      })

      return { success: false, error: message }
    }
  },
})

function generatePlainTextVersion(args: any): string {
  return `
Booking Confirmed!

Hi ${args.bookerName},

Your booking for ${args.eventName} is confirmed.

Booking Reference: ${args.bookingRef}
Date: ${args.eventDate}
Location: ${args.eventLocation}

${args.tikkieUrl ? `Please complete your payment: ${args.tikkieUrl}` : ""}

View your booking: ${args.successPageUrl}
  `.trim()
}
```

### Triggering Email from Submission

```typescript
// In the submission handler (app/api/signup/submit/route.ts)
// After successful submission...

// Fire-and-forget email (don't await, don't block response)
convex
  .action(api.email.sendSignupConfirmation, {
    to: submission.bookerEmail,
    bookerName: submission.bookerName,
    bookingRef: submission.bookingRef,
    // ... other args
  })
  .catch((err) => {
    // Log but don't fail the request
    console.error("Failed to queue confirmation email:", err)
  })
```

### Dead Letter Queue Pattern

```typescript
// convex/email.ts

export const logFailedEmail = internalMutation({
  args: {
    recipient: v.string(),
    bookingRef: v.string(),
    error: v.string(),
    emailType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("failedEmails", {
      ...args,
      createdAt: Date.now(),
      retryCount: 0,
      status: "failed",
    })
  },
})

export const logSentEmail = internalMutation({
  args: {
    recipient: v.string(),
    bookingRef: v.string(),
    emailId: v.optional(v.string()),
    emailType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sentEmails", {
      ...args,
      sentAt: Date.now(),
    })
  },
})
```

---

## 3. Success Page Routing & Data Fetching

### Route Structure

```
app/
  signup/
    success/
      [bookingRef]/
        page.tsx          # Success page component
        loading.tsx       # Loading state
        error.tsx         # Error boundary
```

### Page Component Pattern

```typescript
// app/signup/success/[bookingRef]/page.tsx
import { notFound } from "next/navigation";
import { SignupSuccessView } from "@/components/signup/SuccessPage";
import { api } from "@/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";

interface SuccessPageProps {
  params: Promise<{ bookingRef: string }>;
}

export default async function SignupSuccessPage({ params }: SuccessPageProps) {
  const { bookingRef } = await params;

  try {
    // Fetch submission data by booking reference
    const submission = await fetchQuery(api.signupSubmission.getByBookingRef, {
      bookingRef,
    });

    if (!submission) {
      notFound();
    }

    // Fetch event details
    const event = await fetchQuery(api.signupCatalog.getPublicSignupCatalog, {
      slug: submission.eventSlug,
    });

    // Fetch Tikkie link if exists
    const tikkieLink = await fetchQuery(api.tikkie.getEventPaymentLink, {
      eventId: submission.eventId,
    });

    return (
      <SignupSuccessView
        submission={submission}
        event={event}
        tikkieUrl={tikkieLink?.paymentUrl || null}
      />
    );
  } catch (error) {
    console.error("Error loading success page:", error);
    throw error; // Let error.tsx handle it
  }
}

// Static params for common booking refs (optional optimization)
export async function generateStaticParams() {
  return []; // Dynamic only - no pre-rendering
}
```

### Convex Query for Submission by Booking Ref

```typescript
// convex/signupSubmission.ts

export const getByBookingRef = query({
  args: {
    bookingRef: v.string(),
  },
  returns: v.optional(
    v.object({
      submissionId: v.id("submissions"),
      bookingRef: v.string(),
      bookerName: v.string(),
      bookerEmail: v.string(),
      bookerPhone: v.optional(v.string()),
      eventId: v.id("events"),
      eventSlug: v.string(),
      submittedAt: v.number(),
      attendees: v.array(
        v.object({
          name: v.string(),
          email: v.optional(v.string()),
          ticketType: v.string(),
          assignedRoom: v.optional(v.string()),
        })
      ),
      roomAssignments: v.array(
        v.object({
          roomType: v.string(),
          hotelName: v.string(),
          bedCount: v.number(),
        })
      ),
      totalAmountMinor: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", args.bookingRef))
      .first()

    if (!submission) {
      return undefined
    }

    // Fetch related attendees
    const attendeeRows = await ctx.db
      .query("submissionAttendees")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect()

    // Build response...
    return {
      submissionId: submission._id,
      bookingRef: submission.bookingRef,
      bookerName: submission.bookerName,
      bookerEmail: submission.bookerEmail,
      bookerPhone: submission.bookerPhone,
      eventId: submission.eventId,
      eventSlug: submission.eventSlug,
      submittedAt: submission._creationTime,
      // ... map attendees and room assignments
    }
  },
})
```

---

## 4. Privacy-Aware Name Matching

### Name Masking Pattern

```typescript
// lib/utils/privacy.ts

/**
 * Masks a full name to show only first initial + last name
 * "John Smith" -> "J. Smith"
 * "Mary Jane Watson" -> "M. Watson"
 * "O'Connor" -> "O'Connor" (single names unchanged)
 */
export function maskName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return ""

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    // Single name - return as-is or apply different rule
    return parts[0]
  }

  const firstInitial = parts[0][0]?.toUpperCase() || ""
  const lastName = parts[parts.length - 1]

  return `${firstInitial}. ${lastName}`
}

/**
 * Masks a name for payment display
 * Preserves enough info for reconciliation but protects privacy
 */
export function maskPaymentPayer(name: string): string {
  return maskName(name)
}
```

### Updated Payment Matching Logic

```typescript
// lib/domain/finance/tikkie-event-payments.ts

interface PaymentMatchingOptions {
  includeAttendeeNames: boolean // NEW: Check attendee names too
}

async function findMatchingOrder(
  payment: TikkiePayment,
  orders: Order[],
  options: PaymentMatchingOptions = { includeAttendeeNames: true }
): Promise<Order | null> {
  const normalizedPayerName = normalizeName(payment.payerName)

  for (const order of orders) {
    // Match against booker name
    const bookerMatch = normalizedNamesMatch(
      normalizeName(order.buyerName),
      normalizedPayerName
    )

    if (
      bookerMatch &&
      amountsMatch(order.totalAmountMinor, payment.amountMinor)
    ) {
      return order
    }

    // NEW: Match against attendee names (if option enabled)
    if (options.includeAttendeeNames && order.attendees) {
      for (const attendee of order.attendees) {
        const attendeeMatch = normalizedNamesMatch(
          normalizeName(attendee.name),
          normalizedPayerName
        )

        if (
          attendeeMatch &&
          amountsMatch(order.totalAmountMinor, payment.amountMinor)
        ) {
          return order
        }
      }
    }
  }

  return null
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // Remove special chars
    .trim()
}

function normalizedNamesMatch(a: string, b: string): boolean {
  // Allow partial matches (e.g., "John" matches "John Smith")
  return a.includes(b) || b.includes(a)
}

function amountsMatch(expected: number, actual: number): boolean {
  // Exact match only (per decision D-11)
  return expected === actual
}
```

### UI Display Pattern

```typescript
// components/finance/PaymentRow.tsx
import { maskPaymentPayer } from "@/lib/utils/privacy";

interface PaymentRowProps {
  payment: {
    id: string;
    payerName: string; // Full name in data
    amountMinor: number;
    matchedOrderId?: string;
  };
}

export function PaymentRow({ payment }: PaymentRowProps) {
  return (
    <tr>
      <td>{maskPaymentPayer(payment.payerName)}</td>
      <td>{formatMoney(payment.amountMinor)}</td>
      <td>{payment.matchedOrderId ? "Matched" : "Unmatched"}</td>
    </tr>
  );
}
```

---

## 5. Tikkie Link Display Pattern

### Success Page Tikkie Section

```typescript
// components/signup/SuccessPage/TikkieSection.tsx
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

interface TikkieSectionProps {
  tikkieUrl: string | null;
  eventName: string;
}

export function TikkieSection({ tikkieUrl, eventName }: TikkieSectionProps) {
  if (!tikkieUrl) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          Payment link will be shared separately. Please check your email or contact the organizers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Complete Your Payment</h3>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* QR Code */}
        <div className="rounded-lg border bg-white p-4">
          <QRCodeSVG value={tikkieUrl} size={160} />
        </div>

        {/* Link & Actions */}
        <div className="flex-1 space-y-3">
          <p className="text-sm text-gray-600">
            Scan the QR code or use the link below to pay for {eventName}.
            You can pay any amount that covers your booking.
          </p>

          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-sm">
              {tikkieUrl}
            </code>
            <CopyButton value={tikkieUrl} />
          </div>

          <Button asChild className="w-full sm:w-auto">
            <a href={tikkieUrl} target="_blank" rel="noopener noreferrer">
              Pay Now
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## 6. Expandable Sections Pattern

```typescript
// components/signup/SuccessPage/ExpandableSection.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function ExpandableSection({
  title,
  icon,
  children,
  defaultExpanded = false,
}: ExpandableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t px-4 py-4">{children}</div>
      )}
    </div>
  );
}

// Usage
<ExpandableSection title="Tickets" icon={<TicketIcon />}>
  {/* Ticket details */}
</ExpandableSection>

<ExpandableSection title="Attendees" icon={<UsersIcon />}>
  {/* Attendee list */}
</ExpandableSection>

<ExpandableSection title="Room Assignments" icon={<BedIcon />}>
  {/* Room details */}
</ExpandableSection>
```

---

## 7. Recommendations Summary

### Email Infrastructure

- **Resend Node.js SDK**: Use `@resend/node` with React Email components for type-safe, composable email templates
- **Environment**: Store `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` in Convex environment variables
- **Async Pattern**: Trigger email via Convex action after successful submission (fire-and-forget, don't await in API route)
- **Error Handling**: Log failed sends to a `failedEmails` table for manual review; successful sends to `sentEmails` for audit

### Success Page

- **Route**: `/signup/success/[bookingRef]` with permanent, shareable URLs
- **Data Fetching**: Server-side fetch using `fetchQuery` with `bookingRef` index lookup
- **Expandable Sections**: Tickets, Attendees, Rooms - collapsed by default for clean overview
- **Tikkie Display**: QR code + link + copy button, with graceful fallback if no event link exists

### Privacy & Payment Tracking

- **Name Masking**: `J. Smith` format using `maskPaymentPayer()` utility
- **Extended Matching**: Include attendee names in auto-matching logic (not just booker name)
- **Amount Matching**: Keep exact amount matching (per decision) alongside name matching
- **UI Consistency**: Apply masking in all payment displays (reconciliation, attendee details, reports)

### Schema Additions Needed

```typescript
// Add to convex/schema.ts
failedEmails: defineTable({
  recipient: v.string(),
  bookingRef: v.string(),
  error: v.string(),
  emailType: v.string(),
  retryCount: v.number(),
  status: v.union(v.literal("failed"), v.literal("pending_retry")),
})
  .index("by_bookingRef", ["bookingRef"])
  .index("by_status", ["status"]),

sentEmails: defineTable({
  recipient: v.string(),
  bookingRef: v.string(),
  emailId: v.optional(v.string()),
  emailType: v.string(),
  sentAt: v.number(),
})
  .index("by_bookingRef", ["bookingRef"]),
```

---

_Research completed: 2026-03-31_
_Next: Create PLAN.md files based on this research_
