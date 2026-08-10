import { getTikkieConfig } from "@/lib/integrations/tikkie/config"

export type IntegrationState = "configured" | "misconfigured" | "unreachable"

type ConnectivityStatus = {
  attempted: boolean
  reachable: boolean
  statusCode: number | null
  ok: boolean
  message: string
}

export type IntegrationStatusRecord = {
  provider: "tikkie"
  name: "Tikkie"
  state: IntegrationState
  configured: boolean
  validationErrors: string[]
  diagnostics: Record<string, string | boolean | null>
  connectivity: ConnectivityStatus
}

export type IntegrationStatusPayload = {
  generatedAt: string
  providers: IntegrationStatusRecord[]
}

async function pingUrl(url: string, headers?: HeadersInit): Promise<ConnectivityStatus> {
  const timeoutMs = Number(process.env.INTEGRATION_PING_TIMEOUT_MS ?? 5000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    })

    clearTimeout(timer)

    return {
      attempted: true,
      reachable: true,
      statusCode: response.status,
      ok: response.ok,
      message: response.ok
        ? "Connectivity check succeeded"
        : `Provider returned HTTP ${response.status}`,
    }
  } catch (error) {
    clearTimeout(timer)

    const message =
      error instanceof Error
        ? `Connectivity check failed: ${error.message}`
        : "Connectivity check failed"

    return {
      attempted: true,
      reachable: false,
      statusCode: null,
      ok: false,
      message,
    }
  }
}

function deriveState(configured: boolean, validationErrors: string[], connectivity: ConnectivityStatus) {
  if (!configured || validationErrors.length > 0) {
    return "misconfigured" as const
  }

  if (!connectivity.reachable) {
    return "unreachable" as const
  }

  if (!connectivity.ok && connectivity.statusCode !== 401 && connectivity.statusCode !== 403) {
    return "unreachable" as const
  }

  return "configured" as const
}

async function buildTikkieStatus(): Promise<IntegrationStatusRecord> {
  const config = getTikkieConfig()

  const connectivity = config.configured
    ? await pingUrl(`${config.values.baseUrl}/paymentrequests?pageSize=1&pageNumber=0`, {
        "API-Key": config.values.apiKey ?? "",
        "X-App-Token": config.values.appToken ?? "",
      })
    : {
        attempted: false,
        reachable: false,
        statusCode: null,
        ok: false,
        message: "Connectivity check skipped until configuration is valid",
      }

  return {
    provider: "tikkie",
    name: "Tikkie",
    state: deriveState(config.configured, config.errors, connectivity),
    configured: config.configured,
    validationErrors: config.errors,
    diagnostics: {
      baseUrl: config.metadata.baseUrl,
      apiKeyConfigured: config.metadata.hasApiKey,
      apiKeyPreview: config.metadata.keyPreview,
      appTokenConfigured: config.metadata.appTokenConfigured,
    },
    connectivity,
  }
}

export async function getIntegrationStatus(): Promise<IntegrationStatusPayload> {
  const tikkie = await buildTikkieStatus()

  return {
    generatedAt: new Date().toISOString(),
    providers: [tikkie],
  }
}
