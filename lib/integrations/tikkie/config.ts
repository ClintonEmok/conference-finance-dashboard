type ValidationResult = {
  configured: boolean
  errors: string[]
  metadata: {
    baseUrl: string
    hasApiKey: boolean
    keyPreview: string | null
    ibanConfigured: boolean
  }
  values: {
    apiKey: string | null
    baseUrl: string
    iban: string | null
  }
}

const DEFAULT_TIKKIE_BASE_URL = "https://api.tikkie.me"

function maskToken(token: string) {
  if (token.length <= 6) {
    return "***"
  }

  return `${token.slice(0, 4)}...${token.slice(-2)}`
}

function isLikelyTikkieKey(value: string) {
  return /^[A-Za-z0-9_\-]{20,}$/.test(value)
}

function isLikelyIban(value: string) {
  return /^[A-Z]{2}[A-Z0-9]{13,32}$/.test(value.replace(/\s+/g, ""))
}

export function getTikkieConfig(): ValidationResult {
  const errors: string[] = []

  const apiKey = process.env.TIKKIE_API_KEY?.trim() ?? ""
  const baseUrl = process.env.TIKKIE_BASE_URL?.trim() || DEFAULT_TIKKIE_BASE_URL
  const iban = process.env.TIKKIE_IBAN?.trim() ?? ""

  if (!apiKey) {
    errors.push("TIKKIE_API_KEY is missing")
  } else if (!isLikelyTikkieKey(apiKey)) {
    errors.push("TIKKIE_API_KEY format appears invalid")
  }

  if (!iban) {
    errors.push("TIKKIE_IBAN is missing")
  } else if (!isLikelyIban(iban)) {
    errors.push("TIKKIE_IBAN format appears invalid")
  }

  try {
    const parsed = new URL(baseUrl)
    if (!parsed.protocol.startsWith("http")) {
      errors.push("TIKKIE_BASE_URL must be an HTTP(S) URL")
    }
  } catch {
    errors.push("TIKKIE_BASE_URL must be a valid URL")
  }

  return {
    configured: errors.length === 0,
    errors,
    metadata: {
      baseUrl,
      hasApiKey: Boolean(apiKey),
      keyPreview: apiKey ? maskToken(apiKey) : null,
      ibanConfigured: Boolean(iban),
    },
    values: {
      apiKey: apiKey || null,
      baseUrl,
      iban: iban || null,
    },
  }
}
