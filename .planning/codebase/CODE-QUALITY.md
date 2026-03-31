# Code Quality Analysis Report

Date: 2026-03-31
Analysis Scope: Full codebase (types, pages, components, patterns)

---

## Executive Summary

- **Types:** Infrastructure exists in `lib/types/` but adoption is critically low (2% of files use centralized types)
- **Pages:** 9 pages exceed 500 LOC threshold, need modularization
- **Components:** 5 "god components" need splitting (2,418 lines total)
- **Patterns:** 15+ duplicate formatting functions, business logic misplaced in components

---

## 1. Type Definitions (Centralization Needed)

### Current State

```
lib/types/           → 7 files with validators + core domain types
```

### Issue: Low Adoption

Only 2 files import from `lib/types/`:

- `components/signup/SignupFlowShell.tsx`
- `components/signup/steps/ReviewSubmitStep.tsx`

### Duplicate Type Definitions

| Type                   | Locations Defining Inline | Should Import From      |
| ---------------------- | ------------------------- | ----------------------- |
| `PaymentSource`        | 4 files                   | `lib/types/payment.ts`  |
| `GenderType`           | 3 files                   | `lib/types/attendee.ts` |
| `CanonicalOrderStatus` | 2 files                   | `lib/types/order.ts`    |
| `TikkieLinkStatus`     | 2 files (duplicate!)      | `lib/types/tikkie.ts`   |

### Duplicate Tikkie Types

`lib/types/accommodation.ts` (lines 11-27) duplicates types from `lib/types/tikkie.ts`:

- `TikkieLinkStatus`
- `TikkieMatchStatus`

### Plan

1. Remove duplicate from `lib/types/accommodation.ts`
2. Create `lib/types/index.ts` for convenient re-exports
3. Update 9 files to import from centralized types

---

## 2. Page Files (Exceed 500 LOC)

### Files Over Threshold

| File                                             | LOC   | Priority | Primary Issue                |
| ------------------------------------------------ | ----- | -------- | ---------------------------- |
| `app/dashboard/accommodation/page.tsx`           | 1,708 | Critical | Massive inline types + state |
| `app/dashboard/events/[slug]/page.tsx`           | 1,340 | Critical | Too much logic inline        |
| `app/dashboard/accommodation/inventory/page.tsx` | 975   | High     | Complex wizard + types       |
| `app/dashboard/page.tsx`                         | 664   | High     | Data fetching + metrics      |
| `app/dashboard/orders/[orderId]/page.tsx`        | 596   | High     | Multiple API calls inline    |
| `app/dashboard/attendees/[attendeeId]/page.tsx`  | 585   | High     | Complex detail view          |
| `app/dashboard/orders/page.tsx`                  | 525   | Medium   | List + filtering             |
| `app/dashboard/events/new/page.tsx`              | 551   | Medium   | Form complexity              |
| `app/dashboard/settings/ticket-types/page.tsx`   | 539   | Medium   | Form handling                |

### Recommended Extractions

**Critical (Phase 1):**

- `app/dashboard/accommodation/page.tsx`: Move `AccommodationWorkspacePayload` to `lib/types/accommodation.ts`, extract submission detail panel
- `app/dashboard/events/[slug]/page.tsx`: Extract tab content to separate components, move helpers to `utils.ts`

**High (Phase 2):**

- `app/dashboard/accommodation/inventory/page.tsx`: Extract modal wizard
- `app/dashboard/page.tsx`: Extract `useDashboardMetrics` hook, extract chart components

---

## 3. Component Modularity

### God Components (Over 300 Lines)

| Component                                       | LOC | Responsibilities                                                                  |
| ----------------------------------------------- | --- | --------------------------------------------------------------------------------- |
| `components/dashboard/event-tikkie-section.tsx` | 875 | 7 (event selector, link modal, payment list, assignment modal, auto-match, quota) |
| `components/signup/SignupFlowShell.tsx`         | 623 | Validation + state management + navigation                                        |
| `components/payments/manual-entry-form.tsx`     | 532 | Search dropdown + form + tabs                                                     |
| `components/payments/payment-list.tsx`          | 395 | Filters + pagination + table                                                      |
| `components/signup/steps/ReviewSubmitStep.tsx`  | 393 | Multiple review cards                                                             |

### Extraction Candidates

**event-tikkie-section.tsx:**

- `EventTikkieHeader.tsx` - Event selector + collapse toggle
- `TikkieLinkCreateModal.tsx` - Create link dialog
- `TikkiePaymentList.tsx` - Payment display per link
- `PaymentAssignModal.tsx` - Order search + assignment
- `QuotaWarning.tsx` - Quota display in modal

**manual-entry-form.tsx:**

- `OrderSearchInput.tsx` - Search dropdown component
- `BankTransferFields.tsx` - Bank-specific form fields
- `useOrderSearch.ts` - Custom hook for search logic

**SignupFlowShell.tsx:**

- `SignupStepIndicator.tsx` - Step progress bar
- `useSignupDraft.ts` - Custom hook for draft state
- Extract `validateAttendeeDetails` to domain

---

## 4. Code Quality Patterns

### Duplicate Formatting Functions (15+)

Found across components and pages:

- `formatDate` - 8+ variations
- `formatDateTime` - 3+ variations
- `formatGenderLabel` - 2+ variations

**Fix:** Consolidate in `lib/format.ts`

### Business Logic in Components

| File                                                     | Should Be                                |
| -------------------------------------------------------- | ---------------------------------------- |
| `components/signup/assignment.ts`                        | `lib/domain/accommodation/assignment.ts` |
| `components/dashboard/tikkie-link-dialog.tsx` validation | `lib/domain/finance/tikkie-links.ts`     |

### Domain Files Doing Too Much

`lib/domain/finance/attendees.ts` (421 lines) mixes:

- Domain types
- Data fetching (convex queries)
- Business logic
- UI-formatters

**Consider:** Split into `attendee-types.ts` + `attendee-service.ts`

---

## 5. Summary Statistics

| Category                        | Count |
| ------------------------------- | ----- |
| Centralized type files          | 7     |
| Inline type definitions in .tsx | 83+   |
| Duplicate type definitions      | 10+   |
| Pages over 500 LOC              | 9     |
| Components over 300 LOC         | 5     |
| Duplicate format functions      | 15+   |

---

## 6. Recommended Phased Approach

### Phase 1: Types

1. Create `lib/types/index.ts`
2. Fix Tikkie duplicate
3. Update imports for 9 files

### Phase 2: Pages (Critical)

1. Split `accommodation/page.tsx`
2. Split `events/[slug]/page.tsx`

### Phase 3: Components

1. Split `event-tikkie-section.tsx`
2. Split `manual-entry-form.tsx`
3. Split `SignupFlowShell.tsx`

### Phase 4: Utilities

1. Consolidate format functions
2. Move misplaced business logic
