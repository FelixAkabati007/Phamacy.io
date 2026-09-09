export type Role = 'administrator' | 'pharmacist' | 'cashier' | 'stock_manager'
export type AccessLevel = 'limited' | 'standard' | 'full'
export type AssignmentStatus = 'pending' | 'active' | 'suspended'
export type Permission = 'products:write' | 'inventory:write' | 'purchases:write' | 'sales:write' | 'expenses:write' | 'reports:read' | 'users:write' | 'audit:read' | 'settings:write'

const grants: Record<Role, Permission[]> = {
  administrator: ['products:write', 'inventory:write', 'purchases:write', 'sales:write', 'expenses:write', 'reports:read', 'users:write', 'audit:read'],
  pharmacist: ['products:write', 'inventory:write', 'purchases:write', 'sales:write', 'reports:read', 'audit:read'],
  cashier: ['sales:write', 'reports:read'],
  stock_manager: ['products:write', 'inventory:write', 'purchases:write', 'reports:read'],
}

export function can(role: Role, permission: Permission, accessLevel: AccessLevel = 'standard', status: AssignmentStatus = 'active') {
  if (status !== 'active') return false
  if (accessLevel === 'limited' && permission.endsWith(':write')) return permission === 'sales:write'
  return grants[role]?.includes(permission) ?? false
}
export function assertPermission(role: Role, permission: Permission, accessLevel: AccessLevel = 'standard', status: AssignmentStatus = 'active') { if (!can(role, permission, accessLevel, status)) throw new Error(`Forbidden: ${permission}`) }
