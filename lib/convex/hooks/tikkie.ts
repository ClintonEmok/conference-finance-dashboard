"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

export function usePaymentLinks(args?: {
  orderId?: string
  status?: "created" | "paid" | "expired"
}) {
  return useQuery(api.tikkie.getPaymentLinks, args ?? {})
}

export function usePaymentLinkById(linkId: Id<"tikkiePaymentLinks">) {
  return useQuery(api.tikkie.getPaymentLinkById, { linkId })
}

export function usePaymentLinkByToken(paymentRequestToken: string) {
  return useQuery(api.tikkie.getPaymentLinkByToken, { paymentRequestToken })
}

export function usePaymentTemplates(eventId: string) {
  return useQuery(api.tikkie.getPaymentTemplates, { eventId })
}

export function useCreatePaymentLink() {
  return useMutation(api.tikkie.createPaymentLink)
}

export function useCreatePaymentTemplate() {
  return useMutation(api.tikkie.createPaymentTemplate)
}

export function useUpdatePaymentLinkStatus() {
  return useMutation(api.tikkie.updatePaymentLinkStatus)
}
