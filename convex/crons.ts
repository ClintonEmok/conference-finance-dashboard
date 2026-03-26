import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
  "ticket-tailor-auto-sync",
  { minutes: 15 },
  internal.autoSync.autoSyncTicketTailor,
  {}
)

crons.interval(
  "tikkie-payments-auto-sync",
  { minutes: 15 },
  internal.autoSync.autoSyncTikkiePayments,
  {}
)

export default crons
