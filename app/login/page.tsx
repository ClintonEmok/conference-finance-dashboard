import { auth } from "@clerk/nextjs/server"

function getSafeCallbackUrl(raw: string | undefined) {
  if (!raw) {
    return "/dashboard"
  }

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw
  }

  return "/dashboard"
}

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const returnBackUrl = getSafeCallbackUrl(params.callbackUrl)
  const { redirectToSignIn } = await auth()

  return redirectToSignIn({ returnBackUrl })
}
