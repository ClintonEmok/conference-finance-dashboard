"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "convex/functions/_generated/api"

export function useSyncRuns() {
  return useQuery(api.sync.getSyncRuns)
}

export function useSyncRunById(runId: string) {
  return useQuery(api.sync.getSyncRunById, { runId: runId as any })
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
