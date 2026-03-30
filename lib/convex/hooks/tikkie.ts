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

export function useUpdatePaymentTemplate() {
  return useMutation(api.tikkie.updatePaymentTemplate)
}

export function useDeletePaymentTemplate() {
  return useMutation(api.tikkie.deletePaymentTemplate)
}

export function useUpdatePaymentLinkStatus() {
  return useMutation(api.tikkie.updatePaymentLinkStatus)
}

export function useTemplateByEventAndTicketType(
  eventId: string,
  ticketTypeLabel: string
) {
  return useQuery(api.tikkie.getTemplateByEventAndTicketType, {
    eventId,
    ticketTypeLabel,
  })
}

// --- Event-level Tikkie ---

export function useEventPaymentLink(eventId: string) {
  return useQuery(api.tikkie.getEventPaymentLink, { eventId })
}

export function useTikkiePaymentsByLink(paymentLinkId: string) {
  return useQuery(api.tikkie.getTikkiePaymentsByLink, { paymentLinkId })
}

export function useAutoMatchTikkiePayments() {
  return useMutation(api.tikkie.autoMatchTikkiePayments)
}

export function useMatchTikkiePayment() {
  return useMutation(api.tikkie.matchTikkiePayment)
}
