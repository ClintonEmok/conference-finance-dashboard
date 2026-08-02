"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

export function usePayments(args?: {
  eventId?: Id<"events">
  orderId?: string
  source?: "tikkie" | "bank_transfer" | "cash"
  status?: "auto_matched" | "manual_assignment" | "ambiguous" | "unassigned" | "donation"
}) {
  return useQuery(api.payments.getPayments, args ?? "skip")
}

export function usePaymentById(paymentId: Id<"payments">) {
  return useQuery(api.payments.getPaymentById, { paymentId })
}

export function useUnassignedPayments(enabled = true) {
  return useQuery(api.payments.getUnassignedPayments, enabled ? {} : "skip")
}

export function usePaymentSummary(orderId: string) {
  return useQuery(api.payments.getPaymentSummary, { orderId })
}

export function useCreatePayment() {
  return useMutation(api.payments.createPayment)
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

export function useAutoMatchPayments() {
  return useMutation(api.payments.autoMatchPayments)
}
