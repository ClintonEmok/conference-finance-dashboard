"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"

export function useOrders(args?: {
  eventId?: string
  status?: "paid" | "refunded" | "cancelled" | "pending"
}) {
  return useQuery(api.orders.getOrders, args ?? {})
}

export function useOrderById(orderId: string) {
  return useQuery(api.orders.getOrderById, { orderId: orderId as any })
}

export function useOrderByProviderId(providerOrderId: string) {
  return useQuery(api.orders.getOrderByProviderId, { providerOrderId })
}

export function useOrderLedger(eventId: string) {
  return useQuery(api.orders.getOrderLedger, { eventId })
}

export function useCreateOrder() {
  return useMutation(api.orders.createOrder)
}

export function useUpsertOrder() {
  return useMutation(api.orders.upsertOrder)
}

export function useUpdateOrderStatus() {
  return useMutation(api.orders.updateOrderStatus)
}
