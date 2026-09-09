'use server'

import { and, asc, desc, eq, gt, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditEvents, batches, expenses, notifications, products, purchaseOrderItems, purchaseOrders, saleLines, sales, settings, stockMovements, suppliers, userProfiles, userRoles } from '@/lib/db/schema'
import { accessRequestInput, batchInput, checkoutInput, expenseInput, productInput, profileInput, purchaseOrderInput, receivePurchaseInput, returnInput, settingInput, stockAdjustmentInput } from '@/lib/validation/pharmacy'
import { assertPermission, type Permission } from '@/lib/permissions'

type Role = 'administrator' | 'pharmacist' | 'cashier' | 'stock_manager'

async function actorId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Authentication required')
  return session.user.id
}

async function requireRole(allowed: Role[], permission?: Permission) {
  const id = await actorId()
  const [assignment] = await db.select({ role: userRoles.role, accessLevel: userRoles.accessLevel, status: userRoles.status }).from(userRoles).where(eq(userRoles.userId, id)).limit(1)
  if (!assignment || !allowed.includes(assignment.role as Role)) throw new Error('Insufficient pharmacy permissions')
  if (permission) assertPermission(assignment.role as Role, permission, assignment.accessLevel as 'limited' | 'standard' | 'full', assignment.status as 'pending' | 'active' | 'suspended')
  return id
}

async function audit(action: string, entityType: string, entityId: string | null, metadata: unknown = {}) {
  await db.insert(auditEvents).values({ actorId: await actorId(), action, entityType, entityId, metadata })
}

export async function listProducts() {
  return db.select().from(products).where(eq(products.isActive, true)).orderBy(asc(products.name))
}

export async function listInventory() {
  try {
    const result = await db.execute(sql`SELECT p.id, p.sku, p.name, p.category, p.unit_price, p.reorder_level, COALESCE(SUM(b.quantity_available), 0)::int AS stock, MIN(b.expiry_date) FILTER (WHERE b.quantity_available > 0) AS nearest_expiry FROM pharmacy_products p LEFT JOIN pharmacy_batches b ON b.product_id = p.id AND b.expiry_date > CURRENT_DATE WHERE p.is_active = true GROUP BY p.id ORDER BY p.name`)
    return Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []
  } catch {
    return []
  }
}

export async function listRecentActivity() {
  try { return await db.execute(sql`SELECT id, action, entity_type, entity_id, created_at FROM pharmacy_audit_events ORDER BY created_at DESC LIMIT 8`) } catch { return [] }
}

export async function listInventoryMovements(productId?: string) {
  await actorId()
  if (productId) return db.select().from(stockMovements).where(eq(stockMovements.productId, productId)).orderBy(desc(stockMovements.createdAt)).limit(100)
  return db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(100)
}

export async function getDashboardMetrics() {
  try {
    const [salesToday] = await db.execute(sql`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS transactions FROM pharmacy_sales WHERE created_at >= CURRENT_DATE`)
    const [inventory] = await db.execute(sql`SELECT COALESCE(SUM(quantity_available * selling_price), 0) AS value, COALESCE(SUM(quantity_available), 0)::int AS units FROM pharmacy_batches WHERE quantity_available > 0`)
    const [lowStock] = await db.execute(sql`SELECT COUNT(*)::int AS count FROM pharmacy_products p WHERE p.is_active = true AND (SELECT COALESCE(SUM(quantity_available), 0) FROM pharmacy_batches b WHERE b.product_id = p.id AND b.expiry_date > CURRENT_DATE) <= p.reorder_level`)
    const [expiring] = await db.execute(sql`SELECT COUNT(*)::int AS count FROM pharmacy_batches WHERE quantity_available > 0 AND expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '90 days'`)
    return { salesToday: Number(salesToday?.total ?? 0), transactions: Number(salesToday?.transactions ?? 0), inventoryValue: Number(inventory?.value ?? 0), inventoryUnits: Number(inventory?.units ?? 0), lowStock: Number(lowStock?.count ?? 0), expiringSoon: Number(expiring?.count ?? 0), source: 'database' as const }
  } catch {
    return { salesToday: 0, transactions: 0, inventoryValue: 0, inventoryUnits: 0, lowStock: 0, expiringSoon: 0, source: 'unavailable' as const }
  }
}

export async function createProduct(input: unknown) {
  const actor = await requireRole(['administrator', 'pharmacist', 'stock_manager'], 'products:write')
  const data = productInput.parse(input)
  const [product] = await db.insert(products).values({ ...data, unitPrice: data.unitPrice.toFixed(2) }).returning()
  await audit('created', 'product', product.id, { sku: product.sku })
  revalidatePath('/')
  return product
}

export async function receiveBatch(input: unknown) {
  const actor = await requireRole(['administrator', 'pharmacist', 'stock_manager'], 'inventory:write')
  const data = batchInput.parse(input)
  if (data.quantity === 0) throw new Error('Received quantity must be greater than zero')
  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.insert(batches).values({ productId: data.productId, batchNumber: data.batchNumber, manufacturedDate: data.manufacturedDate, expiryDate: data.expiryDate, purchasePrice: data.costPrice.toFixed(2), sellingPrice: (data.sellingPrice ?? data.costPrice).toFixed(2), quantityReceived: data.quantity, quantityAvailable: data.quantity, supplierId: data.supplierId }).returning()
    await tx.insert(stockMovements).values({ productId: data.productId, batchId: batch.id, movementType: 'PURCHASE', quantity: data.quantity, unitCost: data.costPrice.toFixed(2), referenceType: 'purchase', performedBy: await actorId(), reason: 'purchase receipt' })
    await tx.insert(auditEvents).values({ actorId: await actorId(), action: 'received', entityType: 'batch', entityId: batch.id, metadata: { quantity: data.quantity, batchNumber: data.batchNumber } })
    return batch
  })
  revalidatePath('/')
  return result
}

export async function adjustStock(input: unknown) {
  const actor = await requireRole(['administrator', 'pharmacist', 'stock_manager'], 'inventory:write')
  const data = stockAdjustmentInput.parse(input)
  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(and(eq(batches.id, data.batchId), eq(batches.productId, data.productId))).for('update')
    if (!batch || batch.quantityAvailable + data.quantity < 0) throw new Error('Adjustment would make stock negative')
    const [updated] = await tx.update(batches).set({ quantityAvailable: sql`${batches.quantityAvailable} + ${data.quantity}`, updatedAt: new Date() }).where(eq(batches.id, data.batchId)).returning()
    await tx.insert(stockMovements).values({ productId: data.productId, batchId: data.batchId, movementType: data.quantity > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', quantity: data.quantity, referenceType: 'manual_adjustment', referenceId: updated.id, performedBy: actor, reason: data.reason })
    await tx.insert(auditEvents).values({ actorId: actor, action: 'adjusted', entityType: 'batch', entityId: updated.id, metadata: { quantity: data.quantity, reason: data.reason } })
    return updated
  })
  revalidatePath('/')
  return result
}

export async function checkout(input: unknown) {
  const actor = await requireRole(['administrator', 'pharmacist', 'cashier'], 'sales:write')
  const data = checkoutInput.parse(input)
  const existing = await db.select().from(sales).where(eq(sales.idempotencyKey, data.idempotencyKey)).limit(1)
  if (existing[0]) return existing[0]
  const result = await db.transaction(async (tx) => {
    const allocations: Array<{ productId: string; batchId: string; quantity: number; unitPrice: string; lineTotal: string }> = []
    let subtotal = 0
    for (const item of data.items) {
      const available = await tx.select({ batch: batches, price: products.unitPrice }).from(batches).innerJoin(products, eq(products.id, batches.productId)).where(and(eq(batches.productId, item.productId), eq(products.isActive, true), gt(batches.quantityAvailable, 0), sql`${batches.expiryDate} > CURRENT_DATE`)).orderBy(asc(batches.expiryDate), asc(batches.createdAt)).for('update')
      let remaining = item.quantity
      for (const row of available) {
        if (remaining <= 0) break
        const quantity = Math.min(remaining, row.batch.quantityAvailable)
        allocations.push({ productId: item.productId, batchId: row.batch.id, quantity, unitPrice: row.price, lineTotal: (quantity * Number(row.price)).toFixed(2) })
        subtotal += quantity * Number(row.price)
        remaining -= quantity
      }
      if (remaining > 0) throw new Error(`Insufficient stock for product ${item.productId}`)
    }
    const [sale] = await tx.insert(sales).values({ receiptNumber: `SL-${Date.now()}`, subtotal: subtotal.toFixed(2), discount: '0', total: subtotal.toFixed(2), paymentMethod: data.paymentMethod, cashierId: await actorId(), idempotencyKey: data.idempotencyKey }).returning()
    for (const line of allocations) {
      const updated = await tx.update(batches).set({ quantityAvailable: sql`${batches.quantityAvailable} - ${line.quantity}`, updatedAt: new Date() }).where(and(eq(batches.id, line.batchId), gte(batches.quantityAvailable, line.quantity))).returning({ id: batches.id })
      if (updated.length !== 1) throw new Error('Stock changed during checkout; please retry')
      await tx.insert(saleLines).values({ saleId: sale.id, productId: line.productId, batchId: line.batchId, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal })
      await tx.insert(stockMovements).values({ productId: line.productId, batchId: line.batchId, movementType: 'SALE', quantity: -line.quantity, referenceType: 'sale', referenceId: sale.receiptNumber, performedBy: await actorId(), reason: 'point of sale' })
    }
    await tx.insert(auditEvents).values({ actorId: await actorId(), action: 'completed', entityType: 'sale', entityId: sale.id, metadata: { receiptNumber: sale.receiptNumber, total: sale.total } })
    return sale
  })
  revalidatePath('/')
  return result
}

export async function returnSale(input: unknown) {
  const actor = await requireRole(['administrator', 'pharmacist'], 'sales:write')
  const data = returnInput.parse(input)
  const result = await db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, data.saleId)).for('update')
    if (!sale || sale.status === 'voided') throw new Error('Sale is not returnable')
    let refundTotal = 0
    for (const line of data.lines) {
      const [saleLine] = await tx.select().from(saleLines).where(and(eq(saleLines.id, line.saleLineId), eq(saleLines.saleId, data.saleId))).for('update')
      if (!saleLine || line.quantity > saleLine.quantity - saleLine.returnedQuantity) throw new Error('Return exceeds the remaining quantity')
      refundTotal += line.quantity * Number(saleLine.unitPrice)
      await tx.update(saleLines).set({ returnedQuantity: sql`${saleLines.returnedQuantity} + ${line.quantity}` }).where(eq(saleLines.id, saleLine.id))
      await tx.update(batches).set({ quantityAvailable: sql`${batches.quantityAvailable} + ${line.quantity}`, updatedAt: new Date() }).where(eq(batches.id, saleLine.batchId))
      await tx.insert(stockMovements).values({ productId: saleLine.productId, batchId: saleLine.batchId, movementType: 'RETURN', quantity: line.quantity, referenceType: 'sale_return', referenceId: sale.id, performedBy: actor, reason: data.reason })
    }
    const [updatedSale] = await tx.update(sales).set({ status: 'partially_returned' }).where(eq(sales.id, data.saleId)).returning()
    await tx.insert(auditEvents).values({ actorId: actor, action: 'returned', entityType: 'sale', entityId: sale.id, metadata: { reason: data.reason, refundTotal: refundTotal.toFixed(2), refundMethod: data.refundMethod, lines: data.lines } })
    return { sale: updatedSale, refundTotal: refundTotal.toFixed(2) }
  })
  revalidatePath('/')
  return result
}

export async function listUsersAndRoles() {
  await requireRole(['administrator'])
  return db.select().from(userRoles).orderBy(desc(userRoles.createdAt)).limit(200)
}

export async function updateUserRole(input: unknown) {
  await requireRole(['administrator'])
  const data = z.object({ userId: z.string().min(1), role: z.enum(['administrator', 'pharmacist', 'cashier', 'stock_manager']), accessLevel: z.enum(['limited', 'standard', 'full']), status: z.enum(['pending', 'active', 'suspended']) }).parse(input)
  const [assignment] = await db.update(userRoles).set({ role: data.role, accessLevel: data.accessLevel, status: data.status }).where(eq(userRoles.userId, data.userId)).returning()
  if (!assignment) throw new Error('User role not found')
  await audit('updated', 'user_role', assignment.id, data)
  revalidatePath('/')
  return assignment
}

export async function listAuditEvents() {
  await requireRole(['administrator'])
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(200)
}

export async function getReportSummary() {
  await requireRole(['administrator', 'pharmacist'], 'reports:read')
  const [metrics, salesRows, expenseRows] = await Promise.all([getDashboardMetrics(), listSales(), listExpenses()])
  const salesTotal = salesRows.reduce((sum, sale) => sum + Number(sale.total), 0)
  const expensesTotal = expenseRows.filter((expense) => expense.status === 'posted').reduce((sum, expense) => sum + Number(expense.amount), 0)
  return { metrics, sales: salesRows, expenses: expenseRows, salesTotal, expensesTotal, netMovement: salesTotal - expensesTotal }
}

function csvCell(value: unknown) { return `"${String(value ?? '').replaceAll('"', '""')}"` }

export async function exportReportCsv() {
  const report = await getReportSummary()
  const rows = [['type', 'reference', 'amount', 'status', 'date'], ...report.sales.map((sale) => ['sale', sale.receiptNumber, sale.total, sale.status, sale.createdAt]), ...report.expenses.map((expense) => ['expense', expense.description, expense.amount, expense.status, expense.expenseDate])]
  return rows.map((row) => row.map(csvCell).join(',')).join('\\n')
}

export async function listSales() {
  await actorId()
  return db.select().from(sales).orderBy(desc(sales.createdAt)).limit(100)
}

export async function listSaleLines(saleId: string) {
  await actorId()
  return db.select().from(saleLines).where(eq(saleLines.saleId, saleId))
}

export async function listSuppliers() {
  return db.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name))
}

export async function listPurchases() {
  try {
    return await db.select({ order: purchaseOrders, supplier: suppliers, total: sql<string>`COALESCE(SUM(${purchaseOrderItems.quantityOrdered} * ${purchaseOrderItems.unitCost}), 0)` }).from(purchaseOrders).leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).leftJoin(purchaseOrderItems, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id)).groupBy(purchaseOrders.id, suppliers.id).orderBy(desc(purchaseOrders.createdAt))
  } catch {
    return []
  }
}

export async function createPurchaseOrder(input: unknown) {
  const actor = await requireRole(['administrator', 'pharmacist', 'stock_manager'], 'purchases:write')
  const data = purchaseOrderInput.parse(input)
  const order = await db.transaction(async (tx) => {
    const [created] = await tx.insert(purchaseOrders).values({ orderNumber: `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, supplierId: data.supplierId, status: 'DRAFT', expectedAt: data.expectedAt ? new Date(data.expectedAt) : undefined, notes: data.notes, createdBy: await actorId() }).returning()
    await tx.insert(purchaseOrderItems).values(data.items.map((item) => ({ purchaseOrderId: created.id, productId: item.productId, quantityOrdered: item.quantityOrdered, unitCost: item.unitCost.toFixed(2) })))
    await tx.insert(auditEvents).values({ actorId: await actorId(), action: 'created', entityType: 'purchase_order', entityId: created.id, metadata: { orderNumber: created.orderNumber } })
    return created
  })
  revalidatePath('/')
  return order
}

export async function receivePurchaseOrder(purchaseOrderId: string, input: unknown) {
  const actor = await requireRole(['administrator', 'pharmacist', 'stock_manager'], 'purchases:write')
  const data = receivePurchaseInput.parse(input)
  const result = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).for('update')
    if (!order || ['RECEIVED', 'CANCELLED'].includes(order.status)) throw new Error('Purchase order is not receivable')
    const orderItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
    const uniqueItemIds = new Set(data.items.map((item) => item.purchaseOrderItemId))
    if (uniqueItemIds.size !== data.items.length) throw new Error('Each purchase order item may only be received once per submission')
    const lines = data.items.map((item) => {
      const poItem = orderItems.find((candidate) => candidate.id === item.purchaseOrderItemId)
      if (!poItem) throw new Error('Purchase order item not found')
      const outstanding = poItem.quantityOrdered - poItem.quantityReceived
      if (item.quantity > outstanding) throw new Error('Received quantity exceeds outstanding quantity')
      return { ...item, poItem }
    })
    for (const line of lines) {
      const [batch] = await tx.insert(batches).values({ productId: line.poItem.productId, batchNumber: line.batchNumber, manufacturedDate: line.manufacturedDate, expiryDate: line.expiryDate, purchasePrice: line.poItem.unitCost, sellingPrice: line.sellingPrice.toFixed(2), quantityReceived: line.quantity, quantityAvailable: line.quantity, supplierId: order.supplierId }).returning()
      await tx.update(purchaseOrderItems).set({ quantityReceived: sql`${purchaseOrderItems.quantityReceived} + ${line.quantity}` }).where(eq(purchaseOrderItems.id, line.poItem.id))
      await tx.insert(stockMovements).values({ productId: line.poItem.productId, batchId: batch.id, movementType: 'PURCHASE', quantity: line.quantity, unitCost: line.poItem.unitCost, referenceType: 'purchase_order', referenceId: purchaseOrderId, performedBy: await actorId(), reason: 'purchase receipt' })
    }
    const refreshed = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
    const fullyReceived = refreshed.every((item) => item.quantityReceived >= item.quantityOrdered)
    const [updated] = await tx.update(purchaseOrders).set({ status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED', receivedAt: fullyReceived ? new Date() : null, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId)).returning()
    await tx.insert(auditEvents).values({ actorId: await actorId(), action: 'received', entityType: 'purchase_order', entityId: purchaseOrderId, metadata: { itemCount: lines.length } })
    return updated
  })
  revalidatePath('/')
  return result
}

export async function createExpense(input: unknown) {
  await requireRole(['administrator', 'pharmacist'], 'expenses:write')
  const data = expenseInput.parse(input)
  const [expense] = await db.insert(expenses).values({ ...data, amount: data.amount.toFixed(2), actorId: await actorId(), status: 'posted' }).returning()
  await audit('created', 'expense', expense.id, { amount: expense.amount })
  revalidatePath('/')
  return expense
}

export async function listExpenses() {
  await actorId()
  return db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)).limit(100)
}

export async function voidExpense(expenseId: string) {
  const actor = await requireRole(['administrator'])
  const [expense] = await db.update(expenses).set({ status: 'voided' }).where(and(eq(expenses.id, expenseId), eq(expenses.status, 'posted'))).returning()
  if (!expense) throw new Error('Expense is already voided or not found')
  await audit('voided', 'expense', expense.id, { amount: expense.amount, actor })
  revalidatePath('/')
  return expense
}

export async function recentAuditEvents() {
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(50)
}

export async function listNotifications() {
  const userId = await actorId()
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(100)
}

export async function markNotificationRead(id: string) {
  const userId = await actorId()
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
  revalidatePath('/')
  return { ok: true }
}

export async function requestAccess(input: unknown) {
  const userId = await actorId()
  const data = accessRequestInput.parse(input)
  const [assignment] = await db.insert(userRoles).values({ userId, role: data.role, accessLevel: data.accessLevel, status: 'pending' }).onConflictDoUpdate({ target: userRoles.userId, set: { role: data.role, accessLevel: data.accessLevel, status: 'pending' } }).returning()
  await audit('requested', 'user_role', assignment.id, { role: assignment.role, accessLevel: assignment.accessLevel })
  return assignment
}

export async function assignRole(userId: string, role: 'administrator' | 'pharmacist' | 'cashier' | 'stock_manager', accessLevel: 'limited' | 'standard' | 'full' = 'standard') {
  await requireRole(['administrator'])
  const [assignment] = await db.insert(userRoles).values({ userId, role, accessLevel, status: 'active' }).onConflictDoUpdate({ target: userRoles.userId, set: { role, accessLevel, status: 'active' } }).returning()
  await audit('assigned', 'user_role', assignment.id, { userId, role })
  return assignment
}

export async function getProfileSettings() {
  const id = await actorId()
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, id)).limit(1)
  const [role] = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, id)).limit(1)
  const pharmacySettings = await db.select().from(settings)
  return { profile: profile ?? { userId: id, displayName: 'Pharmacy user', phone: '', jobTitle: '', avatarUrl: null }, role: role?.role ?? 'unassigned', settings: pharmacySettings }
}

export async function saveProfile(input: unknown) {
  const id = await actorId()
  const data = profileInput.parse(input)
  const [profile] = await db.insert(userProfiles).values({ userId: id, ...data }).onConflictDoUpdate({ target: userProfiles.userId, set: { ...data, updatedAt: new Date() } }).returning()
  await audit('updated', 'user_profile', id)
  revalidatePath('/')
  return profile
}

export async function saveSetting(key: string, value: unknown) {
  await requireRole(['administrator'])
  const data = settingInput.parse({ key, value })
  const [setting] = await db.insert(settings).values({ key: data.key, value: data.value }).onConflictDoUpdate({ target: settings.key, set: { value: data.value, updatedAt: new Date() } }).returning()
  await audit('updated', 'setting', key)
  revalidatePath('/')
  return setting
}

export async function getReportsSummary() {
  await actorId()
  const [summary] = await db.execute(sql`SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*)::int AS transactions FROM pharmacy_sales WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`)
  const [expensesTotal] = await db.execute(sql`SELECT COALESCE(SUM(amount), 0) AS total FROM pharmacy_expenses WHERE expense_date >= CURRENT_DATE - INTERVAL '30 days'`)
  return { sales: Number(summary?.sales ?? 0), transactions: Number(summary?.transactions ?? 0), expenses: Number(expensesTotal?.total ?? 0) }
}
