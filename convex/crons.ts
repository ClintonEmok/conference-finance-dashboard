import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
  "ticket-tailor-auto-sync",
  { minutes: 15 },
  internal.autoSync.autoSyncTicketTailor,
  {}
)

export default crons
