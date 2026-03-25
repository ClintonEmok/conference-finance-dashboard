"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "convex/functions/_generated/api"

export function usePaymentLinks(args?: {
  orderId?: string
  status?: "created" | "paid" | "expired"
}) {
  return useQuery(api.tikkie.getPaymentLinks, args ?? {})
}

export function usePaymentLinkById(linkId: string) {
  return useQuery(api.tikkie.getPaymentLinkById, { linkId: linkId as any })
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
