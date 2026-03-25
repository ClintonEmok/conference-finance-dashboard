"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "convex/functions/_generated/api"

export function usePayments(args?: {
  orderId?: string
  source?: "tikkie" | "bank_transfer" | "cash"
  status?: "auto_matched" | "manual_assignment" | "ambiguous" | "unassigned"
}) {
  return useQuery(api.payments.getPayments, args ?? {})
}

export function usePaymentById(paymentId: string) {
  return useQuery(api.payments.getPaymentById, { paymentId: paymentId as any })
}

export function useUnassignedPayments() {
  return useQuery(api.payments.getUnassignedPayments)
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

export function useUnassignPayment() {
  return useMutation(api.payments.unassignPayment)
}

export function useAutoMatchPayments() {
  return useMutation(api.payments.autoMatchPayments)
}
