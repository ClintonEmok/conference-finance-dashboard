import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => ({
    url: new URL(
      path,
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    ).toString(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.5,
  })

  return [url("/")]
}
