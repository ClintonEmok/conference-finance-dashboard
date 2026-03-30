# Testing Patterns

**Analysis Date:** 2026-03-30

## Test Framework

**Runner:**

- Vitest v4.1
- Config: `vitest.config.ts`
- Environment: `node`

**Assertion Library:**

- Vitest built-in (`expect` from `vitest`)
- No separate assertion library (e.g., Chai) used

**Mocking:**

- Vitest built-in `vi.mock()`, `vi.fn()`, `vi.hoisted()`, `vi.spyOn()`

**Run Commands:**

```bash
npx vitest run              # Run all tests
npx vitest run --watch      # Watch mode (implicit without 'run')
npx vitest run --coverage   # Coverage
```

**Test file inclusion (from `vitest.config.ts`):**

```typescript
include: ["tests/**/*.test.ts", "app/**/*.test.ts"]
```

## Test File Organization

**Location:**

- Primary test directory: `tests/` — mirrors domain structure by feature
- Co-located tests: `app/api/signup/submit/route.test.ts` (co-located with route handler)
- Component tests: `components/signup/submission-client.test.ts` (co-located with source)

**Naming:**

- All test files use `{name}.test.ts` suffix
- No `.spec.ts` files in this codebase

**Directory Structure:**

```
tests/
├── accommodation/          # Accommodation domain tests
├── attendees/              # Attendee detail tests
├── payments/               # Payment route tests
├── reconciliation/         # Reconciliation logic tests
├── signup-flow/            # Signup submission client tests
├── ticket-tailor/          # Ticket Tailor integration tests
└── tikkie/                 # Tikkie integration tests
```

## Test Structure

**Suite Organization:**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted() for variables needed by vi.mock() factories
const mocks = vi.hoisted(() => ({
  submitSignup: vi.fn(),
}))

// vi.mock() calls — must come before imports of mocked modules
vi.mock("@/lib/domain/signup/submission", () => ({
  submitSignup: mocks.submitSignup,
}))

// Actual imports after mocks
import { POST } from "@/app/api/signup/submit/route"

describe("POST /api/signup/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 201 with stable submission reference fields", async () => {
    // Arrange → Act → Assert
  })
})
```

**Patterns:**

- `beforeEach(() => vi.clearAllMocks())` — Standard setup for resetting mock state between tests
- `vi.mocked(fn).mockResolvedValueOnce(...)` — One-shot mock resolution
- `vi.mocked(fn).mockReturnValueOnce(...)` — One-shot mock return
- `vi.mocked(fn).mockRejectedValueOnce(...)` — One-shot mock rejection

## Mocking

**Framework:** Vitest built-in

**Module Mocking Pattern:**

```typescript
// Step 1: Use vi.hoisted() for variables needed by mock factories
const mocks = vi.hoisted(() => ({
  convexQuery: vi.fn(),
  convexMutation: vi.fn(),
}))

// Step 2: Mock modules using the hoisted references
vi.mock("@/lib/convex/server", () => ({
  convexQuery: mocks.convexQuery,
  convexMutation: mocks.convexMutation,
}))

// Step 3: Import after mocks are set up
import { convexQuery } from "@/lib/convex/server"
```

**Honeypot Mock Pattern (env setup):**

```typescript
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
})
```

**Spy Pattern (global fetch):**

```typescript
const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
  new Response(JSON.stringify({ data: { ... } }), { status: 201 })
)
```

**What to Mock:**

- `@/lib/convex/server` — `convexQuery`, `convexMutation` (always mocked)
- `@/lib/auth/server` — `requireApiUser` (always mocked in API route tests)
- External API clients (Ticket Tailor, Tikkie)
- Domain functions when testing route handlers in isolation

**What NOT to Mock:**

- Pure utility functions like `normalizeSignalFilters`, `parseOptionalDate`
- Type definitions and validators
- React components (no component testing framework detected)

## Fixtures and Factories

**Test Data Patterns:**

1. **Inline fixture objects:**

```typescript
const baseOrder = {
  providerOrderId: "ORD-1",
  providerEventId: "event-1",
  eventName: "Conference",
  normalizedStatus: "pending",
  totalAmountMinor: 1000,
  currency: "EUR",
  orderedAt: "2026-03-20T10:00:00.000Z",
  refundedAt: null,
}
```

2. **Factory functions with `buildBoard()` pattern:**

```typescript
function buildBoard(
  overrides: Partial<RoomAllocationBoard>
): RoomAllocationBoard {
  return {
    generatedAt: "2026-03-27T00:00:00.000Z",
    filters: { ... },
    availableEvents: [],
    hotels: [{ id: "hotel-1", name: "Main Hotel", assignedEventIds: [] }],
    // ... sensible defaults ...
    ...overrides,
  }
}
```

3. **Draft fixtures for form state:**

```typescript
const draftFixture: SignupDraft = {
  eventId: "event_1",
  source: "internal",
  step: "review",
  ticketSelections: [ ... ],
  attendees: [ ... ],
  // ... complete shape ...
}
```

**Location:**

- Fixtures defined inline within test files (no separate fixture files)

## Coverage

**Requirements:** None enforced in config

**View Coverage:**

```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests:**

- Domain logic: `tests/accommodation/accommodation-filter-state.test.ts`
- Client-side utilities: `components/signup/submission-client.test.ts`
- Pure functions: `tests/accommodation/allocation-proposal.test.ts`

**Integration Tests (API route handlers):**

- Mock dependencies (auth, Convex queries/mutations) but test route handler logic end-to-end
- Example: `tests/payments/payments-route.test.ts`, `tests/tikkie/webhook-route.test.ts`
- Pattern: Call `GET()`/`POST()` directly with `new Request(...)` and assert on `response.status` and `response.json()`

**E2E Tests:** Not used

## Common Patterns

**Async Testing:**

```typescript
it("returns attendee detail payload for authenticated GET requests", async () => {
  vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
  vi.mocked(getAttendeeDetail).mockResolvedValue(attendeeDetailFixture)

  const response = await GET(
    new Request("http://localhost/api/dashboard/attendees/attendee_1"),
    { params: Promise.resolve({ attendeeId: "attendee_1" }) }
  )

  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body).toEqual({ ... })
})
```

**Error Testing:**

```typescript
it("returns 400 with INVALID_SUBMISSION when validation fails", async () => {
  vi.mocked(submitSignup).mockRejectedValueOnce(
    new mocks.SignupSubmissionValidationError("Invalid 'attendees'. At least one attendee is required.")
  )

  const response = await POST(new Request(...))
  const body = await response.json()

  expect(response.status).toBe(400)
  expect(body).toEqual({
    error: {
      code: "INVALID_SUBMISSION",
      message: "Invalid 'attendees'. At least one attendee is required.",
    },
  })
})
```

**Negative Assertion Pattern:**

```typescript
expect(submitSignup).not.toHaveBeenCalled()
expect(listPayments).not.toHaveBeenCalled()
```

**Request Construction Pattern:**

```typescript
// API route tests construct standard Request objects
const response = await POST(
  new Request("http://localhost/api/signup/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": "client-provided-key",
    },
    body: JSON.stringify({ ... }),
  })
)
```

**describe/it naming convention:**

- `describe` — Route path or function name (e.g., `"POST /api/signup/submit"`, `"runTicketTailorSync"`)
- `it` — Descriptive behavior in present tense (e.g., `"returns 201 with stable submission reference fields"`)

---

_Testing analysis: 2026-03-30_
