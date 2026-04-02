"use client"

import { useQuery } from "convex/react"
import { api } from "@/lib/convex/api"
import { normalizePublicSignupCatalog } from "@/lib/domain/signup/catalog"

export function usePublicSignupCatalogRaw() {
  return useQuery(api.signupCatalog.getPublicSignupCatalog, {})
}

export function usePublicSignupCatalog() {
  const catalog = usePublicSignupCatalogRaw()
  return normalizePublicSignupCatalog(catalog)
}
