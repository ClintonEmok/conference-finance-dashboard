# Phase 10 Research: Payment Reconciliation

**Researched:** 2026-03-25
**Phase:** 10 - Payment Reconciliation (Tikkie Open, Bank Transfers, Cash)

## Domain Understanding

### What This Phase Delivers

A unified payment reconciliation system that handles three payment sources:

1. **Tikkie Open Payments** - Event-wide payment links where payer name is provided
2. **Bank Transfers** - Manual entry of incoming bank transfers
3. **Cash Payments** - Manual entry of cash payments

The core challenge: Match incoming payments (from any source) to orders/attendees automatically where possible, and provide manual assignment for unresolved payments.

---

## Research Findings

### 1. Fuzzy Matching Algorithms

Based on research into payment reconciliation best practices:

**Key Algorithms:**

- **Levenshtein Distance** - Minimum character edits to transform one string to another. Best for typos and minor spelling variations.
- **Jaro-Winkler** - Gives higher similarity scores for matches at the beginning. Particularly effective for names like "Microsoft Corporation" vs "Microsoft Corp".
- **Token-based matching** - Splits strings into words, sorts alphabetically, then compares. Handles word order variations: "Johnson Williams" vs "Williams Johnson".

**Recommended Thresholds:**

- **95-100%** - High confidence: Auto-reconcile without review
- **85-94%** - Medium confidence: Auto-match but flag for sampling
- **Below 85%** - Low confidence: Send to manual review queue

**For this phase:**

- Use exact match (case-insensitive) for primary auto-match: `payerName === buyerName`
- Jaro-Winkler for secondary fuzzy matching when exact fails
- Consider storing similarity scores for audit trail

### 2. Matching Topology Considerations

**1:1 Matching** (one payment → one order)

- Standard case: single order, single payment
- Use: exact amount + exact/fuzzy name match

**1:N Matching** (one payment → multiple orders)

- Rare for this use case, but possible with combined payments
- Use: amount sum match + name matching

**N:1 Matching** (multiple payments → one order)

- Partial payments case
- Track payment allocations per attendee

### 3. Tikkie Open Payments Integration

**From existing Phase 7 code:**

- `getPaymentRequest(paymentRequestToken)` - Fetches payment request status
- `getPaymentRequestPayments(paymentRequestToken)` - Lists payments for a request
- Status: `created` | `paid` | `expired`

**Key insight:** Open Tikkie payments have payer information including:

- `payerName` - The person who made the payment
- `payerAccountNumber` - IBAN (for bank transfers)
- `amount` - Payment amount in minor units

**For this phase:**

- Need to poll for NEW payments on open Tikkie links (payments not previously seen)
- Store Payment records separately from TikkiePaymentLink (many payments per open link)
- Match by payerName → buyerName

### 4. Manual Entry Considerations

**Bank Transfer Entry:**

- Fields needed: amount, date, payer name, notes, (optional) reference
- Should allow searching/selecting order first, then recording payment details

**Cash Entry:**

- Fields needed: amount, date, payer name, notes
- Simpler flow than bank transfer (no reference needed)

**Best Practice from research:**

- Always link to order first, then add payment details
- This prevents orphaned payments
- Order-first also helps with amount validation (warn if payment > order total)

### 5. Reconciliation States

Based on research, implement tiered states:

| State      | Description                      | Action                              |
| ---------- | -------------------------------- | ----------------------------------- |
| Unassigned | Payment received, no order match | Manual assignment                   |
| Partial    | Payment < order total            | Show progress, expect more          |
| Fully Paid | Payment >= order total           | Mark as complete                    |
| Overpaid   | Payment > order total            | Flag for review (donation vs error) |

**Sorting priority:** Unassigned → Partial → Overpaid → Fully Paid

### 6. Polling Strategy

**Recommendation:**

- Webhook primary (real-time): Already configured in Phase 7
- Scheduled job secondary (fallback): Poll every 5-15 minutes
- Store last-checked timestamp per payment request
- Use provider notification keys to avoid duplicate processing

---

## Implementation Recommendations

### Database Schema (Payment Model)

```prisma
enum PaymentSource {
  tikkie
  bank_transfer
  cash
}

enum PaymentMatchStatus {
  auto_matched
  manual_assignment
  ambiguous
  unassigned
}

model Payment {
  id              String   @id @default(cuid())
  source          PaymentSource
  sourceId        String?  // Tikkie: payment ID, Bank/Cash: internal

  // Payer info (from payment)
  payerName       String
  payerAccountNumber String?

  // Amount
  amountMinor     Int
  paidAt          DateTime

  // Linkage
  orderId         String?
  status          PaymentMatchStatus @default(unassigned)
  matchedAt       DateTime?
  matchedBy       String?  // 'auto' or user ID

  // Manual entry specifics
  reference       String?  // Bank transfer reference
  notes           String?

  // Source data preservation
  providerPayload Json?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([orderId])
  @@index([source, sourceId])
  @@index([status])
}
```

### Matching Logic Flow

```
For each new payment:
1. EXACT MATCH: Find orders where buyerName (case-insensitive) = payerName
   - If exactly 1 match → Auto-assign, status = auto_matched
   - If 0 matches → Status = unassigned
   - If >1 matches → Status = ambiguous, show in manual queue

2. FUZZY MATCH (if no exact):
   - Apply Jaro-Winkler with 85% threshold
   - Same logic as exact: 1=auto, 0=unassigned, >1=ambiguous

3. MANUAL: Admin selects order from dropdown
```

### API Endpoints Needed

| Endpoint                         | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| GET /api/payments                | List payments with filters (status, order, source) |
| POST /api/payments/tikkie/sync   | Poll new Tikkie payments                           |
| POST /api/payments/bank-transfer | Manual bank transfer entry                         |
| POST /api/payments/cash          | Manual cash entry                                  |
| PATCH /api/payments/:id/assign   | Manual order assignment                            |
| GET /api/reconciliation          | Dashboard summary                                  |

### UI Components Needed

1. **Reconciliation Dashboard** - Summary cards (unassigned/partial/paid/overpaid counts)
2. **Payment List** - Filterable table with status
3. **Manual Assignment Modal** - Select order for unassigned payment
4. **Bank Transfer Form** - Order search + payment details
5. **Cash Form** - Order search + payment details

---

## Validation Architecture

**Manual verification approach (no automated validation possible):**

- Reconciliation is inherently a visual/human workflow
- Validate via dashboard inspection
- Key checks:
  - Open Tikkie payments appear in list after sync
  - Manual entries save correctly
  - Auto-matching works for obvious name matches
  - Manual assignment flow completes

---

## Risks & Mitigations

| Risk                                | Mitigation                                |
| ----------------------------------- | ----------------------------------------- |
| Name variations cause false matches | Use high threshold (95%+) for auto-match  |
| Duplicate payments                  | Check sourceId uniqueness per source      |
| Missing Tikkie webhook              | Fallback to scheduled polling job         |
| Overpayment handling                | Clear UI for marking as donation vs error |

---

## References

- Existing Tikkie client: `lib/integrations/tikkie/client.ts`
- Existing payment link domain: `lib/domain/finance/tikkie-links.ts`
- Prisma schema: `prisma/schema.prisma`
- UI components: `components/ui/` (shadcn)
- Research source: Fuzzy matching in financial reconciliation (ReconArt, Oracle docs)

---

_Research completed for Phase 10 planning_
