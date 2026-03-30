# Coding Conventions

**Analysis Date:** 2026-03-30

## Naming Patterns

**Files:**

- Source files: `kebab-case` (e.g., `dashboard-shell.tsx`, `submission-client.ts`)
- Test files: `{name}.test.ts` or `{name}.test.tsx` — co-located or in `tests/` mirror directories
- Type definition files: `kebab-case` (e.g., `signup.ts`, `accommodation.ts`) in `lib/types/`

**Functions:**

- `camelCase` for all functions and variables
- `PascalCase` for components and custom error classes (e.g., `DashboardErrorState`, `SignupSubmissionValidationError`)
- API route handlers exported as `GET`, `POST`, `PATCH`, `DELETE` (Next.js convention)
- Helper/utility functions use descriptive verbs: `parseOptionalDate`, `formatMoney`, `enforceRateLimit`

**Variables:**

- `camelCase` for all variables
- SCREAMING_SNAKE_CASE only for `const` values that represent configuration defaults (e.g., `DEFAULT_CONFIG`, `EUR_FORMATTER`)
- Type parameters: single uppercase letters (`T`, `U`)

**Types:**

- `PascalCase` for all type aliases and interfaces (e.g., `CanonicalOrderStatus`, `SignupSubmissionEnvelope`)
- Discriminated union types use a `status` field with literal string values
- Validator suffix convention: `{name}Validator` for Convex validators, `{name}ErrorCodeValues` for error code constants

## Code Style

**Formatting:**

- Tool: Prettier (`prettier` + `prettier-plugin-tailwindcss`)
- No semicolons (`"semi": false`)
- Double quotes (`"singleQuote": false`)
- Tab width: 2 spaces
- Trailing commas: `"es5"`
- Print width: 80 characters
- Tailwind class sorting in `cn()` and `cva()` calls

**Linting:**

- Tool: ESLint with `eslint-config-next` (core-web-vitals + typescript)
- Config: `eslint.config.mjs` (flat config format)
- Ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`

**TypeScript:**

- `strict: true` enabled
- Target: ES2017
- Module: ESM (`"type": "module"` in package.json)
- Path alias: `@/*` maps to project root
- Explicit return types not enforced; TypeScript inference preferred
- Type assertions via `as Record<string, unknown>` for JSON parsing

## Import Organization

**Order:**

1. `react` / `next/*` framework imports
2. Third-party packages (e.g., `lucide-react`, `clsx`, `@clerk/nextjs`)
3. `@/components/*` — UI components
4. `@/lib/*` — Utilities, types, domain logic
5. `@/app/*` — Route handlers and pages

**Path Aliases:**

- `@/*` — Project root (configured in `tsconfig.json` via `"baseUrl": "."` and `"paths": {"@/*": ["./*"]}`)

**Example:**

```typescript
import { NextResponse } from "next/server"
import { clsx, type ClassValue } from "clsx"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { requireApiUser } from "@/lib/auth/server"
```

## Error Handling

**API Routes (server):**

```typescript
// Pattern: Structured JSON error with code + message
return NextResponse.json(
  {
    error: {
      code: "INVALID_SUBMISSION",
      message: error.message,
    },
  },
  { status: 400 }
)
```

**Error codes used across the app:**

- `UNAUTHORIZED` (401) — Auth check failed
- `INVALID_SUBMISSION` (400) — Validation failure
- `SUBMISSION_CONFLICT` (409) — Idempotency/uniqueness violation
- `RATE_LIMITED` (429) — Rate limit exceeded
- `HONEYPOT_TRIGGERED` (400) — Bot detection
- `BAD_REQUEST` (400) — Generic validation failure
- `INTERNAL_ERROR` (500) — Unexpected server error
- `INVALID_SIGNATURE` (401) — Webhook verification failure
- `BAD_PAYLOAD` (400) — Malformed JSON

**Custom Error Classes:**

- Use `class SignupSubmissionValidationError extends Error` for domain-specific errors with a `code` property

**Auth Pattern:**

```typescript
// In API routes — returns NextResponse on failure, user object on success
const authResult = await requireApiUser()
if (authResult instanceof NextResponse) {
  return authResult
}
```

**Parsing Pattern:**

```typescript
// Guards — throw descriptive errors on invalid input
function parseOptionalDate(value: string | null, field: "from" | "to") {
  if (!value || !value.trim()) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }
  return parsed
}
```

## Logging

**Framework:** No logging framework detected. Console output only.

**Patterns:**

- No structured logging in source files
- Convex backend handles its own logging

## Comments

**When to Comment:**

- JSDoc on exported utility functions (see `lib/format.ts`, `lib/rate-limit.ts`)
- Configuration constants get inline comments explaining purpose
- Type definitions include doc comments on shared types (see `lib/types/shared.ts`)
- No comments on trivial code

**JSDoc/TSDoc:**

- Used on utility functions with `@param` and return descriptions
- Example from `lib/format.ts`:

```typescript
/**
 * Format a minor-unit (cent) amount as a EUR display string.
 *
 * @param minor – Amount in cents (e.g. 1250 → "€12.50").
 */
export function formatMoney(minor: number): string {
  return EUR_FORMATTER.format(minor / 100)
}
```

## Function Design

**Size:** Functions are small and single-purpose (typically under 50 lines)

**Parameters:**

- Destructured objects for components: `{ className, variant = "default", size = "default", asChild = false, ...props }`
- Positional params for utility functions with few arguments
- Options object pattern for complex APIs: `submitSignup(body, { idempotencyKey, payloadFingerprint, honeypotSeen })`

**Return Values:**

- API routes: Always return `NextResponse.json()`
- Utility functions: Return explicit types, never `any`
- Auth functions: Return union type (`NextResponse | { userId }`) for auth-protected routes

## Module Design

**Exports:**

- Named exports preferred over default exports (components, utilities, hooks)
- Default exports used only for Next.js route handlers and pages (framework requirement)
- `as const` used for immutable configuration arrays (e.g., `signupSubmissionErrorCodeValues`)

**Domain Logic:**

- Business logic lives in `lib/domain/` (e.g., `lib/domain/finance/order-ledger.ts`)
- Shared types in `lib/types/` (e.g., `lib/types/signup.ts`)
- Integrations in `lib/integrations/` (e.g., `lib/integrations/ticket-tailor/client.ts`)

---

_Convention analysis: 2026-03-30_
