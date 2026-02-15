import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function generateOrderNumber(): string {
  const prefix = 'ORD';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function generateReceiptNumber(): string {
  const prefix = 'RCP';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function calculateSavings(lowest: number, highest: number): { amount: number; percent: number } {
  const amount = highest - lowest;
  const percent = highest > 0 ? (amount / highest) * 100 : 0;
  return { amount: Math.round(amount * 100) / 100, percent: Math.round(percent * 10) / 10 };
}

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function getStockStatusColor(status: string): string {
  switch (status) {
    case 'IN_STOCK': return 'text-success';
    case 'LOW_STOCK': return 'text-status-warning';
    case 'OUT_OF_STOCK': return 'text-status-error';
    case 'BACKORDER': return 'text-status-info';
    default: return 'text-dark';
  }
}

export function getStockStatusDot(status: string): string {
  switch (status) {
    case 'IN_STOCK': return 'bg-success';
    case 'LOW_STOCK': return 'bg-status-warning';
    case 'OUT_OF_STOCK': return 'bg-status-error';
    case 'BACKORDER': return 'bg-status-info';
    default: return 'bg-gray-400';
  }
}

export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'PENDING': return 'bg-status-warning/10 text-status-warning';
    case 'CONFIRMED': return 'bg-brand-teal/10 text-brand-teal';
    case 'PROCESSING': return 'bg-status-info/10 text-status-info';
    case 'SHIPPED': return 'bg-brand-blue/10 text-brand-blue';
    case 'DELIVERED': return 'bg-success/10 text-success';
    case 'CANCELLED': return 'bg-status-error/10 text-status-error';
    case 'REJECTED': return 'bg-status-error/10 text-status-error';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}
