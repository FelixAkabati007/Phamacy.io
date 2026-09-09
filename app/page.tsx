import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { PharmacyDashboard } from '@/components/pharmacy-dashboard'
import { PwaRegister } from '@/components/pwa-register'
import { getDashboardMetrics, getProfileSettings, getReportSummary, listAuditEvents, listExpenses, listInventory, listNotifications, listPurchases, listSales, listUsersAndRoles } from '@/app/actions/pharmacy'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const [metrics, purchaseRows, inventoryRows, profileSettings, salesRows, expenseRows, notifications] = await Promise.all([getDashboardMetrics(), listPurchases(), listInventory(), getProfileSettings(), listSales(), listExpenses(), listNotifications()])
  const isAdmin = profileSettings.role === 'administrator'
  const canReport = isAdmin || profileSettings.role === 'pharmacist'
  const [roles, audit, report] = await Promise.all([isAdmin ? listUsersAndRoles() : Promise.resolve([]), isAdmin ? listAuditEvents() : Promise.resolve([]), canReport ? getReportSummary() : Promise.resolve(undefined)])
  const purchases = purchaseRows.map(({ order, supplier, total }) => ({ orderNumber: order.orderNumber, supplier: supplier?.name ?? 'Unassigned supplier', status: order.status, expected: order.expectedAt?.toISOString() ?? 'Not set', total: new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(total ?? 0)) }))
  const products = inventoryRows.map((row) => ({ id: String((row as { id?: unknown }).id ?? ''), name: String(row.name), sku: String(row.sku), category: String(row.category), stock: Number(row.stock ?? 0), reorder: Number(row.reorder_level ?? 0), price: Number(row.unit_price ?? 0), expiry: row.nearest_expiry ? new Date(String(row.nearest_expiry)).toLocaleDateString('en-GH', { month: 'short', year: 'numeric' }) : 'No batch', batch: 'FEFO' }))
  return <><PwaRegister /><PharmacyDashboard metrics={metrics} purchases={purchases} products={products} profileSettings={profileSettings} sales={salesRows} expenses={expenseRows} adminRoles={roles} auditEvents={audit} notifications={notifications} report={report} /></>
}
