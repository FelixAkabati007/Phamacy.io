'use client'

import { useState } from 'react'
import { saveProfile, saveSetting } from '@/app/actions/pharmacy'

type Profile = { displayName: string; phone: string | null; jobTitle: string | null }
type Setting = { key: string; value: unknown }

export function ProfileSettingsWorkspace({ profile, role, settings, onNotify }: { profile: Profile; role: string; settings: Setting[]; onNotify: (message: string) => void }) {
  const [name, setName] = useState(profile.displayName)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '')
  const [pharmacyName, setPharmacyName] = useState(String(settings.find((item) => item.key === 'pharmacy_name')?.value ?? ''))
  const [expiryDays, setExpiryDays] = useState(String(settings.find((item) => item.key === 'expiry_alert_days')?.value ?? '90'))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await saveProfile({ displayName: name, phone, jobTitle })
      if (role === 'administrator') {
        await saveSetting('pharmacy_name', pharmacyName)
        await saveSetting('expiry_alert_days', Number(expiryDays))
      }
      onNotify('Profile and settings saved')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not save settings')
    } finally { setSaving(false) }
  }

  return <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-5"><div className="flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-lg font-bold text-sky-700">{name.slice(0, 1).toUpperCase()}</div><div><p className="font-semibold text-slate-900">{name || 'Your profile'}</p><p className="text-sm text-slate-500">{role.replace('_', ' ')}</p></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-700">Display name<input value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Job title<input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="grid gap-2 text-sm font-medium text-slate-700 sm:col-span-2">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5" /></label></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><p className="font-semibold text-slate-900">Pharmacy operations</p><p className="mt-1 text-sm text-slate-500">These settings control receipts and inventory alerts.</p><div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-medium text-slate-700">Pharmacy name<input disabled={role !== 'administrator'} value={pharmacyName} onChange={(event) => setPharmacyName(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 disabled:bg-slate-50" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Expiry alert days<input disabled={role !== 'administrator'} type="number" min="1" max="365" value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 disabled:bg-slate-50" /></label></div></section>
    <div className="lg:col-span-2 flex justify-end"><button disabled={saving} onClick={save} className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button></div>
  </div>
}
