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
  openGraph: {
    type: "website",
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
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
