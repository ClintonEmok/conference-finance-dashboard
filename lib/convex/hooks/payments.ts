"use client"

import { useConvexAuth, useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

export function usePayments(args?: {
  eventId?: Id<"events">
  orderId?: string
  source?: "tikkie" | "bank_transfer" | "cash"
  status?:
    | "auto_matched"
    | "manual_assignment"
    | "ambiguous"
    | "unassigned"
    | "donation"
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  return useQuery(
    api.payments.getPayments,
    isAuthenticated && !isLoading ? (args ?? "skip") : "skip"
  )
}

/**
 * Null-tolerant: the donation detail route's `donationId` is a free URL
 * segment, and passing a malformed string into the query would throw Convex's
 * argument validation DURING RENDER (straight into the error boundary, past
 * the promised not-found state). `null` skips the subscription entirely.
 */
export function usePaymentById(paymentId: Id<"payments"> | null) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const queryArgs = paymentId === null ? "skip" : { paymentId }
  return useQuery(
    api.payments.getPaymentById,
    isAuthenticated && !isLoading ? queryArgs : "skip"
  )
}

export function useUnassignedPayments(enabled = true, search?: string) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  return useQuery(
    api.payments.getUnassignedPayments,
    !enabled || !isAuthenticated || isLoading
      ? "skip"
      : search?.trim()
        ? { search }
        : {}
  )
}

export function usePaymentSummary(orderId: string) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  return useQuery(
    api.payments.getPaymentSummary,
    isAuthenticated && !isLoading ? { orderId } : "skip"
  )
}

export function useCreatePayment() {
  return useMutation(api.payments.createPayment)
}

export function useLogReconciliationPayment() {
  return useMutation(api.payments.logReconciliationPayment)
}

export function useAssignPaymentToOrder() {
  return useMutation(api.payments.assignPaymentToOrder)
}

export function useMarkPaymentAsDonation() {
  return useMutation(api.payments.markPaymentAsDonation)
}

export function useUnassignPayment() {
  return useMutation(api.payments.unassignPayment)
}

export function useDeletePayment() {
  return useMutation(api.payments.deletePayment)
}

export function useAutoMatchPayments() {
  return useMutation(api.payments.autoMatchPayments)
}
