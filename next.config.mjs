/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/dashboard/events/:slug/sources",
        destination: "/dashboard/events/:slug/settings/sources",
        permanent: true,
      },
      {
        source: "/dashboard/events/:slug/sources/:path*",
        destination: "/dashboard/events/:slug/settings/sources/:path*",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
