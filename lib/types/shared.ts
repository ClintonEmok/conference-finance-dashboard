/**
 * Shared utility types used across the application.
 */

/**
 * Pagination result — standard shape returned by Convex .paginate().
 */
export type PaginatedResult<T> = {
  page: T[]
  isDone: boolean
  continueCursor: string
}

/**
 * Standard API error response contract.
 */
export type ApiError = {
  error: {
    code: string
    message: string
  }
}

/**
 * Money amount in minor units (cents).
 */
export type AmountMinor = number

/**
 * ISO timestamp string.
 */
export type IsoTimestamp = string
