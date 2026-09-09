import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sky-50 p-6"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.12),transparent_32%)]" /><div className="relative w-full max-w-md"><AuthForm mode="sign-up" /></div></main>
}
