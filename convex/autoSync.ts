import { internalAction } from "./_generated/server"

export const autoSyncTicketTailor = internalAction({
  args: {},
  handler: async () => {
    const appUrl = process.env.APP_URL?.trim()

    if (!appUrl) {
      console.warn("Ticket Tailor auto-sync skipped: APP_URL not configured")
      return
    }

    try {
      const response = await fetch(`${appUrl}/api/ticket-tailor/sync`, {
        method: "POST",
      })

      if (!response.ok) {
        const body = await response.text()
        console.error(
          `Ticket Tailor auto-sync failed (${response.status}): ${body}`
        )
        return
      }

      const result = await response.json()
      console.log("Ticket Tailor auto-sync completed", {
        runId: result.runId,
        status: result.status,
        eventsScanned: result.counts?.eventsScanned,
        ordersUpserted: result.counts?.ordersUpserted,
        attendeesUpserted: result.counts?.attendeesUpserted,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error(`Ticket Tailor auto-sync error: ${message}`)
    }
  },
})
