import { LoginForm } from "@/app/login/login-form"

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
  const callbackUrl = getSafeCallbackUrl(params.callbackUrl)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-6 py-10">
      <section className="w-full rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Finance dashboard sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with email and password, or create an account to get started.
        </p>

        <LoginForm callbackUrl={callbackUrl} />
      </section>
    </main>
  )
}
