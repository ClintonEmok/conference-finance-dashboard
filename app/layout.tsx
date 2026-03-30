import { ClerkProvider } from "@clerk/nextjs"
import { Geist_Mono, Outfit } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import QueryProvider from "@/app/providers"
import { cn } from "@/lib/utils"
import { ConvexClientProvider } from "../lib/convex/client"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

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
              <ThemeProvider>
                {children}
              </ThemeProvider>
            </QueryProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}