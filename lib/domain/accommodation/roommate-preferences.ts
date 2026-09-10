export type RoommateCandidate = {
  attendeeId: string
  attendeeName?: string | null
  attendeeEmail?: string | null
}

export type RoommatePreferenceMatches = {
  requestedIds: string[]
  avoidedIds: string[]
}

export function normalizeRoommateTokens(
  value: string | null | undefined
): string[] {
  if (!value) return []
  return value
    .split(/[;,\n]/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

export function buildPersonSignatures(
  name: string | null | undefined,
  email: string | null | undefined
): string[] {
  return [name, email]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter(
      (value, index, values) =>
        Boolean(value) && values.indexOf(value) === index
    )
}

function matchPreference(
  value: string | null | undefined,
  candidates: RoommateCandidate[]
) {
  const tokens = new Set(normalizeRoommateTokens(value))
  if (tokens.size === 0) return []
  return candidates
    .filter((candidate) =>
      buildPersonSignatures(
        candidate.attendeeName,
        candidate.attendeeEmail
      ).some((signature) => tokens.has(signature))
    )
    .map((candidate) => candidate.attendeeId)
}

export function matchRoommatePreferences(input: {
  roommatePreference?: string | null
  roommateAvoid?: string | null
  candidates: RoommateCandidate[]
}): RoommatePreferenceMatches {
  return {
    requestedIds: matchPreference(input.roommatePreference, input.candidates),
    avoidedIds: matchPreference(input.roommateAvoid, input.candidates),
  }
}
