import { afterEach, describe, expect, it, vi } from "vitest"

import robots from "@/app/robots"

describe("robots metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("blocks the signup prefix and emits an absolute sitemap URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com")

    expect(robots()).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: ["/api/", "/dashboard/", "/login", "/signup"],
        },
      ],
      sitemap: "https://example.com/sitemap.xml",
    })
  })
})
