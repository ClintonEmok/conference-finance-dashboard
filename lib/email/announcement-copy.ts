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
  "Upgrades and options are now available"

export const ANNOUNCEMENT_MESSAGE =
  "Accommodation upgrades and options are now available for your stay, including upgrades to your included accommodation, an optional night before the conference, and cots."

export const ANNOUNCEMENT_NOTE =
  "Manage your booking to choose the available accommodation options for your stay, including Standard or Superior upgrades, night-before accommodation, and a cot."
