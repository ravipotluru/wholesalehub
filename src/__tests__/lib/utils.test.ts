/**
 * Utility Function Tests
 *
 * Tests for src/lib/utils.ts — helper functions used across the application.
 */

import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  generateOrderNumber,
  generateReceiptNumber,
  calculateSavings,
  debounce,
  getStockStatusColor,
  getStockStatusDot,
  getOrderStatusColor,
  truncate,
} from '@/lib/utils';

// ─── cn (class name merge) ───

describe('cn — class name merging', () => {
  it('should merge simple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle Tailwind conflict resolution via twMerge', () => {
    // twMerge should resolve conflicting Tailwind classes
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });

  it('should handle conditional classes via clsx', () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn('base', isActive && 'active', isDisabled && 'disabled');
    expect(result).toContain('base');
    expect(result).toContain('active');
    expect(result).not.toContain('disabled');
  });

  it('should handle undefined and null values gracefully', () => {
    const result = cn('base', undefined, null, 'extra');
    expect(result).toBe('base extra');
  });

  it('should handle empty call', () => {
    expect(cn()).toBe('');
  });

  it('should handle object syntax from clsx', () => {
    const result = cn({ 'text-red-500': true, 'text-blue-500': false });
    expect(result).toBe('text-red-500');
  });
});

// ─── formatCurrency ───

describe('formatCurrency', () => {
  it('should format a number as USD currency', () => {
    expect(formatCurrency(10.5)).toBe('$10.50');
  });

  it('should format zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should format large numbers with comma grouping', () => {
    const result = formatCurrency(1234567.89);
    expect(result).toBe('$1,234,567.89');
  });

  it('should accept a string and parse it as a number', () => {
    expect(formatCurrency('25.99')).toBe('$25.99');
  });

  it('should handle negative amounts', () => {
    const result = formatCurrency(-42.5);
    expect(result).toContain('42.50');
  });

  it('should handle whole numbers by appending .00', () => {
    expect(formatCurrency(100)).toBe('$100.00');
  });
});

// ─── formatDate ───

describe('formatDate', () => {
  it('should format a Date object', () => {
    const d = new Date('2024-03-15T12:00:00Z');
    const result = formatDate(d);
    // Intl output for en-US short month: "Mar 15, 2024"
    expect(result).toContain('Mar');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should format a date string', () => {
    const result = formatDate('2024-12-25');
    expect(result).toContain('Dec');
    expect(result).toContain('25');
    expect(result).toContain('2024');
  });
});

// ─── formatDateTime ───

describe('formatDateTime', () => {
  it('should format a Date object with time', () => {
    const d = new Date('2024-06-01T14:30:00');
    const result = formatDateTime(d);
    expect(result).toContain('Jun');
    expect(result).toContain('1');
    expect(result).toContain('2024');
    // Should include some form of time
    expect(result).toContain(':');
  });

  it('should accept a string argument', () => {
    const result = formatDateTime('2024-01-20T09:15:00');
    expect(result).toContain('Jan');
    expect(result).toContain('20');
    expect(result).toContain('2024');
  });
});

// ─── generateOrderNumber ───

describe('generateOrderNumber', () => {
  it('should start with ORD- prefix', () => {
    const orderNum = generateOrderNumber();
    expect(orderNum).toMatch(/^ORD-/);
  });

  it('should contain uppercase alphanumeric characters', () => {
    const orderNum = generateOrderNumber();
    // ORD-<base36timestamp>-<random>
    expect(orderNum).toMatch(/^ORD-[A-Z0-9]+-[A-Z0-9]+$/);
  });

  it('should generate unique values on successive calls', () => {
    const a = generateOrderNumber();
    const b = generateOrderNumber();
    expect(a).not.toBe(b);
  });
});

// ─── generateReceiptNumber ───

describe('generateReceiptNumber', () => {
  it('should start with RCP- prefix', () => {
    const receiptNum = generateReceiptNumber();
    expect(receiptNum).toMatch(/^RCP-/);
  });

  it('should contain uppercase alphanumeric characters', () => {
    const receiptNum = generateReceiptNumber();
    expect(receiptNum).toMatch(/^RCP-[A-Z0-9]+-[A-Z0-9]+$/);
  });

  it('should generate unique values on successive calls', () => {
    const a = generateReceiptNumber();
    const b = generateReceiptNumber();
    expect(a).not.toBe(b);
  });
});

// ─── calculateSavings ───

describe('calculateSavings', () => {
  it('should calculate correct amount and percentage', () => {
    const result = calculateSavings(80, 100);
    expect(result.amount).toBe(20);
    expect(result.percent).toBe(20);
  });

  it('should return zero when lowest equals highest', () => {
    const result = calculateSavings(50, 50);
    expect(result.amount).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('should handle zero highest gracefully (no division by zero)', () => {
    const result = calculateSavings(0, 0);
    expect(result.amount).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('should round amount to 2 decimal places', () => {
    const result = calculateSavings(9.99, 15.99);
    expect(result.amount).toBe(6);
  });

  it('should round percent to 1 decimal place', () => {
    const result = calculateSavings(33, 100);
    expect(result.percent).toBe(67);
  });

  it('should handle fractional prices accurately', () => {
    const result = calculateSavings(12.49, 14.99);
    expect(result.amount).toBe(2.5);
    expect(result.percent).toBeCloseTo(16.7, 0);
  });
});

// ─── debounce ───

describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not call the function immediately', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('should call the function after the delay', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced();
    jest.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset the timer on repeated calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced();
    jest.advanceTimersByTime(200);
    debounced(); // reset
    jest.advanceTimersByTime(200);

    // 400ms total elapsed, but only 200ms since last call — should NOT fire yet
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the debounced function', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced('hello', 42);
    jest.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });

  it('should only call once for rapid successive invocations', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced();
    debounced();
    debounced();
    debounced();
    debounced();

    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── getStockStatusColor ───

describe('getStockStatusColor', () => {
  it('should return success color for IN_STOCK', () => {
    expect(getStockStatusColor('IN_STOCK')).toBe('text-success');
  });

  it('should return warning color for LOW_STOCK', () => {
    expect(getStockStatusColor('LOW_STOCK')).toBe('text-status-warning');
  });

  it('should return error color for OUT_OF_STOCK', () => {
    expect(getStockStatusColor('OUT_OF_STOCK')).toBe('text-status-error');
  });

  it('should return info color for BACKORDER', () => {
    expect(getStockStatusColor('BACKORDER')).toBe('text-status-info');
  });

  it('should return dark text for unknown status', () => {
    expect(getStockStatusColor('UNKNOWN')).toBe('text-dark');
  });
});

// ─── getStockStatusDot ───

describe('getStockStatusDot', () => {
  it('should return success bg for IN_STOCK', () => {
    expect(getStockStatusDot('IN_STOCK')).toBe('bg-success');
  });

  it('should return warning bg for LOW_STOCK', () => {
    expect(getStockStatusDot('LOW_STOCK')).toBe('bg-status-warning');
  });

  it('should return error bg for OUT_OF_STOCK', () => {
    expect(getStockStatusDot('OUT_OF_STOCK')).toBe('bg-status-error');
  });

  it('should return info bg for BACKORDER', () => {
    expect(getStockStatusDot('BACKORDER')).toBe('bg-status-info');
  });

  it('should return gray bg for unknown status', () => {
    expect(getStockStatusDot('UNKNOWN')).toBe('bg-gray-400');
  });
});

// ─── getOrderStatusColor ───

describe('getOrderStatusColor', () => {
  it('should return correct classes for PENDING', () => {
    expect(getOrderStatusColor('PENDING')).toBe('bg-status-warning/10 text-status-warning');
  });

  it('should return correct classes for CONFIRMED', () => {
    expect(getOrderStatusColor('CONFIRMED')).toBe('bg-brand-teal/10 text-brand-teal');
  });

  it('should return correct classes for PROCESSING', () => {
    expect(getOrderStatusColor('PROCESSING')).toBe('bg-status-info/10 text-status-info');
  });

  it('should return correct classes for SHIPPED', () => {
    expect(getOrderStatusColor('SHIPPED')).toBe('bg-brand-blue/10 text-brand-blue');
  });

  it('should return correct classes for DELIVERED', () => {
    expect(getOrderStatusColor('DELIVERED')).toBe('bg-success/10 text-success');
  });

  it('should return correct classes for CANCELLED', () => {
    expect(getOrderStatusColor('CANCELLED')).toBe('bg-status-error/10 text-status-error');
  });

  it('should return correct classes for REJECTED', () => {
    expect(getOrderStatusColor('REJECTED')).toBe('bg-status-error/10 text-status-error');
  });

  it('should return fallback classes for unknown status', () => {
    expect(getOrderStatusColor('FOO_BAR')).toBe('bg-gray-100 text-gray-600');
  });
});

// ─── truncate ───

describe('truncate', () => {
  it('should return the original string when it is shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should return the original string when it is exactly maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('should truncate and append "..." when the string exceeds maxLength', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('should handle empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('should handle maxLength of 0', () => {
    expect(truncate('test', 0)).toBe('...');
  });
});
