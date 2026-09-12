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
  "tikkie-legacy-payment-cleanup",
  { hours: 1 },
  internal.payments.internalCleanupLegacyTikkiePayments,
  {}
)

crons.interval(
  "fully-paid-orders-sync",
  { minutes: 15 },
  internal.orders.syncFullyPaidOrders,
  {}
)

crons.interval(
  "payment-reminders-dispatch",
  { minutes: 15 },
  internal.paymentReminders.automaticTick,
  { paginationOpts: { numItems: 25, cursor: null } }
)

export default crons
