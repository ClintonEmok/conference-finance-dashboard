import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
  "tikkie-payments-auto-sync",
  { minutes: 15 },
  internal.autoSync.autoSyncTikkiePayments,
  {}
)

crons.interval(
  "fully-paid-orders-sync",
  { minutes: 15 },
  internal.orders.syncFullyPaidOrders,
  {}
)

export default crons
