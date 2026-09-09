'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, signUp } from '@/lib/auth-client'
import { requestAccess } from '@/app/actions/pharmacy'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'pharmacist' | 'cashier' | 'stock_manager'>('pharmacist')
  const [accessLevel, setAccessLevel] = useState<'limited' | 'standard' | 'full'>('standard')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true); setError('')
    const result = mode === 'sign-in' ? await signIn.email({ email, password }) : await signUp.email({ email, password, name })
    if (result.error) { setPending(false); setError('Unable to authenticate with those details.'); return }
    if (mode === 'sign-up') { try { await requestAccess({ role, accessLevel }) } catch { setPending(false); setError('Account created, but access approval could not be submitted. Contact an administrator.'); return } }
    setPending(false)
    router.push('/'); router.refresh()
  }
  return <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-sky-100 bg-white p-6 shadow-sm">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">CarePoint Pharmacy OS</p><h1 className="mt-2 text-2xl font-bold text-slate-950">{mode === 'sign-in' ? 'Sign in to your workspace' : 'Create your pharmacy account'}</h1><p className="mt-2 text-sm leading-6 text-slate-500">Use your pharmacy account to access stock, purchasing, and point-of-sale controls.</p></div>
    {mode === 'sign-up' && <><label className="block text-sm font-medium text-slate-700">Full name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-500" /></label><label className="block text-sm font-medium text-slate-700">Requested role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-sky-500"><option value="pharmacist">Pharmacist</option><option value="cashier">Cashier</option><option value="stock_manager">Stock Manager</option></select></label><label className="block text-sm font-medium text-slate-700">Requested access level<select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as typeof accessLevel)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-sky-500"><option value="limited">Limited · view and basic tasks</option><option value="standard">Standard · daily operations</option><option value="full">Full · elevated controls</option></select></label><p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Your role request remains pending until an administrator reviews and approves your access.</p></>}
    <label className="block text-sm font-medium text-slate-700">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-500" /></label>
    <label className="block text-sm font-medium text-slate-700">Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-500" /></label>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <button disabled={pending} className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
    <p className="text-center text-sm text-slate-500">{mode === 'sign-in' ? <>Need an account? <a className="font-semibold text-sky-700 hover:text-sky-800" href="/sign-up">Create one</a></> : <>Already registered? <a className="font-semibold text-sky-700 hover:text-sky-800" href="/sign-in">Sign in</a></>}</p>
  </form>
}
