import { initCRPC } from "../functions/generated/server"

const c = initCRPC.create()

export const publicQuery = c.query
export const publicMutation = c.mutation
export const publicAction = c.action

export type QueryCtx = typeof c extends { query: infer Q }
  ? Q extends (ctx: infer C) => unknown
    ? C
    : never
  : never
export type MutationCtx = typeof c extends { mutation: infer M }
  ? M extends (ctx: infer C) => unknown
    ? C
    : never
  : never
export type ActionCtx = typeof c extends { action: infer A }
  ? A extends (ctx: infer C) => unknown
    ? C
    : never
  : never
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx
