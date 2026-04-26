import { ClerkProvider } from "@clerk/nextjs"
import type { Metadata } from "next"
import { Geist_Mono, Outfit } from "next/font/google"
import "react-phone-number-input/style.css"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import QueryProvider from "@/app/providers"
import { cn } from "@/lib/utils"
import { ConvexClientProvider } from "../lib/convex/client"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

const siteTitle = "DCLM NL Conference Dashboard"
const siteDescription =
  "Conference finance operations for church teams, from attendee signups to payment reconciliation."

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: siteTitle,
    template: `%s | ${siteTitle}`,
  },
  description: siteDescription,
  applicationName: siteTitle,
  authors: [{ name: siteTitle }],
  generator: "Next.js",
  keywords: ["conference", "finance", "dashboard", "church", "management"],
  referrer: "origin-when-cross-origin",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  openGraph: {
    type: "website",
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en" suppressHydrationWarning>
        <body
          className={cn(
            "antialiased",
            fontMono.variable,
            outfit.variable,
            "font-sans"
          )}
        >
          <ConvexClientProvider>
            <QueryProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </QueryProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
