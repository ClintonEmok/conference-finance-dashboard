"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

export function useSyncRuns() {
  return useQuery(api.sync.getSyncRuns)
}

export function useSyncRunById(runId: Id<"ticketTailorSyncRuns">) {
  return useQuery(api.sync.getSyncRunById, { runId })
}

export function useLatestSyncRun() {
  return useQuery(api.sync.getLatestSyncRun)
}

export function useWebhookEvents(args?: {
  status?: "pending" | "processed" | "failed"
}) {
  return useQuery(api.sync.getWebhookEvents, args ?? {})
}

export function useCreateWebhookEvent() {
  return useMutation(api.sync.createWebhookEvent)
}

export function useProcessWebhookEvent() {
  return useMutation(api.sync.processWebhookEvent)
}
