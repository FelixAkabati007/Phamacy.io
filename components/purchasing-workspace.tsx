'use client'

import { useState } from 'react'
import { CheckCircle2, Plus, Truck, X } from 'lucide-react'

type Purchase = { orderNumber: string; supplier: string; status: string; expected: string; total: string }

export function PurchasingWorkspace({ onNotify, initialPurchases }: { onNotify: (message: string) => void; initialPurchases: Purchase[] }) {
  const [showNew, setShowNew] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [purchases, setPurchases] = useState(initialPurchases)
  const [supplier, setSupplier] = useState('MedSupply Ghana Ltd')
  const [product, setProduct] = useState('Paracetamol 500mg')
  const [quantity, setQuantity] = useState('500')
  const [batch, setBatch] = useState('PCM-2026-001')
  const [expiry, setExpiry] = useState('2028-06-30')

  const createOrder = () => {
    setPurchases((current) => [{ orderNumber: `PO-2026-00${current.length + 320}`, supplier, status: 'DRAFT', expected: 'Not set', total: 'GH₵0.00' }, ...current])
    setShowNew(false)
    onNotify('Purchase order created as draft')
  }

  const receive = () => {
    setPurchases((current) => current.map((item, index) => index === 0 ? { ...item, status: 'PARTIALLY_RECEIVED' } : item))
    setShowReceive(false)
    onNotify(`${quantity} units received into batch ${batch}`)
  }

  const statusClass = (status: string) => status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-700' : status === 'PARTIALLY_RECEIVED' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'

  return <div className="mt-5">
    <div className="flex flex-wrap gap-2"><button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-100"><Plus className="size-4" />New purchase order</button><button onClick={() => setShowReceive(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600"><Truck className="size-4" />Receive shipment</button></div>
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{purchases.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center"><p className="text-sm font-semibold text-slate-700">No purchase orders yet</p><p className="mt-1 text-xs text-slate-400">Create a draft order to start tracking supplier deliveries.</p></td></tr> : purchases.map((item) => <tr key={item.orderNumber}><td className="px-4 py-4 font-semibold text-slate-700">{item.orderNumber}</td><td className="px-4 py-4 text-slate-500">{item.supplier}</td><td className="px-4 py-4 text-slate-400">{item.expected}</td><td className="px-4 py-4 font-semibold text-slate-700">{item.total}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(item.status)}`}>{item.status.replace('_', ' ')}</span></td><td className="px-4 py-4 text-right"><button onClick={() => { setShowReceive(true); onNotify(`Opening ${item.orderNumber}`) }} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-sky-600">Open</button></td></tr>)}</tbody></table></div>
    {showNew && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-lg font-bold text-slate-950">New purchase order</p><p className="mt-1 text-xs text-slate-400">Creating an order does not increase stock.</p></div><button onClick={() => setShowNew(false)}><X className="size-5 text-slate-400" /></button></div><label className="mt-6 block text-xs font-semibold text-slate-600">Supplier<select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option>MedSupply Ghana Ltd</option><option>HealthPlus Distribution</option><option>Medline Ghana</option></select></label><label className="mt-4 block text-xs font-semibold text-slate-600">Product<input value={product} onChange={(e) => setProduct(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-4 block text-xs font-semibold text-slate-600">Quantity ordered<input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><div className="mt-6 flex justify-end gap-2"><button onClick={() => setShowNew(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500">Cancel</button><button onClick={createOrder} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Create draft</button></div></div></div>}
    {showReceive && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-lg font-bold text-slate-950">Receive shipment</p><p className="mt-1 text-xs text-slate-400">A batch and stock movement will be created atomically.</p></div><button onClick={() => setShowReceive(false)}><X className="size-5 text-slate-400" /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Product<input value={product} onChange={(e) => setProduct(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Batch number<input value={batch} onChange={(e) => setBatch(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Expiry date<input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Quantity<input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setShowReceive(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500">Cancel</button><button onClick={receive} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"><CheckCircle2 className="size-4" />Receive stock</button></div></div></div>}
  </div>
}

