"use client"

import { useQuery } from "convex/react"
import { api } from "@/lib/convex/api"
import { normalizePublicSignupCatalog } from "@/lib/domain/signup/catalog"

export function usePublicSignupCatalog() {
  const catalog = useQuery(api.signupCatalog.getPublicSignupCatalog, {})
  return normalizePublicSignupCatalog(catalog)
}
