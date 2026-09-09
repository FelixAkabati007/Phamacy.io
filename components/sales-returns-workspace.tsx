'use client'

import { useMemo, useState } from 'react'
import { listSaleLines, returnSale } from '@/app/actions/pharmacy'

const money = (value: string | number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value))

type Sale = { id: string; receiptNumber: string; status: string; total: string; paymentMethod: string; createdAt: Date | string }
type SaleLine = { id: string; productId: string; quantity: number; returnedQuantity: number; unitPrice: string; lineTotal: string }

export function SalesReturnsWorkspace({ initialSales, onNotify }: { initialSales: Sale[]; onNotify: (message: string) => void }) {
  const [sales, setSales] = useState(initialSales)
  const [selected, setSelected] = useState<Sale | null>(null)
  const [lines, setLines] = useState<SaleLine[]>([])
  const [reason, setReason] = useState('Customer return')
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const visible = useMemo(() => sales.filter((sale) => `${sale.receiptNumber} ${sale.paymentMethod} ${sale.status}`.toLowerCase().includes(query.toLowerCase())), [sales, query])
  const openSale = async (sale: Sale) => { setSelected(sale); setLoading(true); try { setLines(await listSaleLines(sale.id)) } catch { onNotify('Unable to load sale lines') } finally { setLoading(false) } }
  const submitReturn = async (line: SaleLine) => { const available = line.quantity - line.returnedQuantity; if (!selected || available < 1) return; setLoading(true); try { const result = await returnSale({ saleId: selected.id, lines: [{ saleLineId: line.id, quantity: 1 }], reason, refundMethod: selected.paymentMethod }); setSales((items) => items.map((item) => item.id === selected.id ? { ...item, status: result.sale.status } : item)); setLines((items) => items.map((item) => item.id === line.id ? { ...item, returnedQuantity: item.returnedQuantity + 1 } : item)); onNotify(`Return recorded: ${money(result.refundTotal)}`) } catch (error) { onNotify(error instanceof Error ? error.message : 'Return failed') } finally { setLoading(false) } }
  return <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
    <div><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5"><input aria-label="Search sales" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search receipt, payment, or status" className="w-full bg-transparent text-sm outline-none" /></div><div className="mt-4 overflow-hidden rounded-xl border border-slate-100"><div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Receipt</span><span>Status</span><span>Payment</span><span>Total</span></div>{visible.map((sale) => <button key={sale.id} onClick={() => openSale(sale)} className={`grid w-full grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr] gap-3 border-t border-slate-100 px-4 py-4 text-left text-xs hover:bg-sky-50 ${selected?.id === sale.id ? 'bg-sky-50' : 'bg-white'}`}><span className="font-semibold text-slate-800">{sale.receiptNumber}<span className="mt-1 block text-[10px] font-normal text-slate-400">{new Date(sale.createdAt).toLocaleString()}</span></span><span className="capitalize text-slate-500">{sale.status.replace('_', ' ')}</span><span className="capitalize text-slate-500">{sale.paymentMethod}</span><span className="font-semibold text-slate-800">{money(sale.total)}</span></button>)}</div></div>
    <aside className="rounded-xl border border-sky-100 bg-sky-50/50 p-4"><p className="text-sm font-semibold text-slate-900">Return a sale</p>{!selected ? <p className="mt-2 text-xs leading-5 text-slate-500">Select a receipt to inspect line items and record an approved return.</p> : <><p className="mt-1 text-xs text-slate-500">{selected.receiptNumber} · {money(selected.total)}</p><label className="mt-4 block text-xs font-semibold text-slate-600">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label><div className="mt-4 space-y-2">{loading ? <p className="text-xs text-slate-500">Loading…</p> : lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3"><div><p className="text-xs font-semibold text-slate-700">Product {line.productId.slice(0, 8)}</p><p className="text-[10px] text-slate-400">{line.returnedQuantity}/{line.quantity} returned · {money(line.lineTotal)}</p></div><button disabled={loading || line.returnedQuantity >= line.quantity} onClick={() => submitReturn(line)} className="rounded-lg bg-sky-600 px-2.5 py-2 text-[10px] font-semibold text-white disabled:opacity-40">Return 1</button></div>)}</div></>}</aside>
  </div>
}
