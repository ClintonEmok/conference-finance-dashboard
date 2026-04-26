import { requirePageUser } from "@/lib/auth/server"
import {
  getIntegrationStatus,
  type IntegrationStatusRecord,
} from "@/lib/integrations/status"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ResendTestSection } from "@/components/dashboard/resend-test-section"

const stateStyles: Record<
  IntegrationStatusRecord["state"],
  { label: string; className: string; action: string }
> = {
  configured: {
    label: "Configured",
    className:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300",
    action: "No immediate action required.",
  },
  misconfigured: {
    label: "Misconfigured",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300",
    action: "Set or correct required environment variables and redeploy.",
  },
  unreachable: {
    label: "Unreachable",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300",
    action:
      "Validate provider availability, credentials, and outbound network access.",
  },
}

function renderDiagnosticValue(value: string | boolean | null) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }

  if (value === null || value === "") {
    return "Not set"
  }

  return value
}

export default async function IntegrationsPage() {
  await requirePageUser("/dashboard/integrations")

  const status = await getIntegrationStatus()

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Runtime status for Ticket Tailor and Tikkie environment configuration.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Last checked: {status.generatedAt}
        </p>
      </header>

      <div className="grid gap-4">
        {status.providers.map((provider) => {
          const state = stateStyles[provider.state]

          return (
            <article
              key={provider.provider}
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{provider.name}</h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${state.className}`}
                >
                  {state.label}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {state.action}
              </p>

              {provider.validationErrors.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                  <p className="font-medium">Validation issues</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {provider.validationErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {Object.entries(provider.diagnostics).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-md border border-border/70 p-2"
                  >
                    <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                      {key}
                    </dt>
                    <dd className="mt-1 font-mono text-xs">
                      {renderDiagnosticValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 rounded-md border border-border/70 p-3 text-sm">
                <p className="font-medium">Connectivity</p>
                <p className="mt-1 text-muted-foreground">
                  {provider.connectivity.message}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Attempted: {provider.connectivity.attempted ? "Yes" : "No"}
                  {" · "}
                  Reachable: {provider.connectivity.reachable ? "Yes" : "No"}
                  {" · "}
                  HTTP status: {provider.connectivity.statusCode ?? "n/a"}
                </p>
              </div>
            </article>
          )
        })}
      </div>

      <div className="rounded-lg border border-border/70 bg-card p-4 text-sm shadow-sm">
        <p className="font-medium">Email preview</p>
        <p className="mt-1 text-muted-foreground">
          Open the styled signup confirmation preview in the dashboard.
        </p>
        <Button asChild variant="outline" className="mt-3">
          <Link href="/dashboard/email-preview">Open preview</Link>
        </Button>
      </div>

      <ResendTestSection />
    </section>
  )
}
