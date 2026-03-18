import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const LOGIN_PATH = "/login"
const DASHBOARD_PATH = "/dashboard"

function toCallbackUrl(pathname: string, search: string) {
  const fullPath = `${pathname}${search}`
  return encodeURIComponent(fullPath)
}

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)
  const { pathname, search } = request.nextUrl

  if (!sessionCookie && pathname.startsWith(DASHBOARD_PATH)) {
    const callbackUrl = toCallbackUrl(pathname, search)
    return NextResponse.redirect(
      new URL(`${LOGIN_PATH}?callbackUrl=${callbackUrl}`, request.url),
    )
  }

  if (sessionCookie && pathname === LOGIN_PATH) {
    const callbackUrl = request.nextUrl.searchParams.get("callbackUrl")
    if (callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")) {
      return NextResponse.redirect(new URL(callbackUrl, request.url))
    }

    return NextResponse.redirect(new URL(DASHBOARD_PATH, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
}
