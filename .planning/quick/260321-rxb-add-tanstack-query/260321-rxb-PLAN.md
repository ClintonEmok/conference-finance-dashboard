---
phase: rxb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - app/providers.tsx (create)
autonomous: true
user_setup: []
must_haves:
  truths:
    - "@tanstack/react-query is installed and type-safe"
    - "QueryProvider wraps the app and persists client state"
  artifacts:
    - path: "app/providers.tsx"
      provides: "TanStack Query client initialization and React context"
      min_lines: 15
  key_links:
    - from: "app/layout.tsx"
      to: "app/providers.tsx"
      via: "import and render QueryProvider"
      pattern: "QueryProvider"
---

<objective>
Install and wire TanStack Query (@tanstack/react-query) into the Next.js app so client components can use useQuery and useMutation for data fetching.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@package.json
</context>

<tasks>

<task type="auto">
  <name>Install @tanstack/react-query</name>
  <files>package.json</files>
  <action>
    Install the latest version of @tanstack/react-query as a production dependency using the project's package manager (bun install or npm/pnpm as configured).
    - Run: `bun install @tanstack/react-query` (or appropriate pm command)
    - Verify the package appears in package.json dependencies
  </action>
  <verify>`grep -q "@tanstack/react-query" package.json && echo "INSTALLED"`</verify>
  <done>@tanstack/react-query is listed in package.json dependencies</done>
</task>

<task type="auto">
  <name>Create QueryProvider and wire into app layout</name>
  <files>app/providers.tsx, app/layout.tsx</files>
  <action>
    Create `app/providers.tsx` as a client component that:
    - Imports QueryClient and QueryClientProvider from @tanstack/react-query
    - Creates a QueryClient instance (persisted via useState so it survives re-renders)
    - Wraps children in QueryClientProvider
    - Exports a default QueryProvider component
    
    Then update `app/layout.tsx` to import and render `<QueryProvider>` inside the body, before the main content. Read the existing layout.tsx first to preserve its structure (it likely has a ThemeProvider and/or metadata already).
  </action>
  <verify>`grep -q "QueryProvider" app/layout.tsx && grep -q "@tanstack/react-query" app/providers.tsx && echo "WIRED"`</verify>
  <done>app/providers.tsx exports QueryProvider, app/layout.tsx renders it</done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes (or `bun run typecheck`)
- `grep -q "@tanstack/react-query" package.json` confirms installation
- `grep -q "QueryProvider" app/layout.tsx` confirms wiring
</verification>

<success_criteria>
TanStack Query is installed, typed, and the QueryProvider wraps the app without breaking the existing layout structure.
</success_criteria>

<output>
After completion, create `.planning/quick/260321-rxb-add-tanstack-query/260321-rxb-SUMMARY.md`
</output>
