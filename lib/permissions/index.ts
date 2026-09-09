export type Role = 'administrator' | 'pharmacist' | 'cashier' | 'stock_manager'
export type Permission = 'products:write' | 'inventory:write' | 'purchases:write' | 'sales:write' | 'expenses:write' | 'reports:read' | 'users:write' | 'audit:read'

const grants: Record<Role, Permission[]> = {
  administrator: ['products:write', 'inventory:write', 'purchases:write', 'sales:write', 'expenses:write', 'reports:read', 'users:write', 'audit:read'],
  pharmacist: ['products:write', 'inventory:write', 'purchases:write', 'sales:write', 'reports:read', 'audit:read'],
  cashier: ['sales:write', 'reports:read'],
  stock_manager: ['products:write', 'inventory:write', 'purchases:write', 'reports:read'],
}

export function can(role: Role, permission: Permission) { return grants[role]?.includes(permission) ?? false }
export function assertPermission(role: Role, permission: Permission) { if (!can(role, permission)) throw new Error(`Forbidden: ${permission}`) }
