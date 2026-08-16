/**
 * Single source of truth for the neutral standard Divine Conference
 * announcement. Imported by the Communications Center preview, the
 * server-side `scheduleEmailBroadcast` contract, and the shared sender —
 * there is deliberately no compose/template CRUD, so this module is the
 * only place the standard announcement copy can change.
 *
 * Deliberately dependency-free so it can be imported from both the
 * client workspace and Convex functions without pulling in React.
 */

export const ANNOUNCEMENT_TITLE =
  "Night-before accommodation is now available"

export const ANNOUNCEMENT_MESSAGE =
  "Add an optional night before the conference at a discounted rate."

export const ANNOUNCEMENT_NOTE =
  "Choose Standard or Superior for the night before when you manage your booking."
