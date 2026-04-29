/**
 * Centralised authorization rule for order reads/mutations. Kept separate
 * from the route handler so it can be unit-tested without spinning up a
 * Next.js request.
 */
export interface OrderAccessUser {
  role: string;
  retailerId: string | null;
  wholesalerId: string | null;
}

export interface OrderForAccessCheck {
  retailerId: string;
  wholesalerId: string;
}

export function canAccessOrder(
  user: OrderAccessUser,
  order: OrderForAccessCheck,
): boolean {
  if (user.role === 'ADMIN' || user.role === 'ANALYST') return true;
  if (user.role === 'RETAILER') {
    return !!user.retailerId && user.retailerId === order.retailerId;
  }
  if (user.role === 'WHOLESALER') {
    return !!user.wholesalerId && user.wholesalerId === order.wholesalerId;
  }
  if (user.role === 'WAREHOUSE_STAFF') {
    return !!user.wholesalerId && user.wholesalerId === order.wholesalerId;
  }
  return false;
}
