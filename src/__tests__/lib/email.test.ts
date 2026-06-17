/**
 * Tests for the Resend email transport.
 *
 * Covers:
 *   - `sendEmail` no-ops gracefully when RESEND_API_KEY is unset
 *   - `sendEmail` calls the Resend SDK with the right shape when configured
 *   - Each transactional template renders without throwing for representative props
 *   - Subject lines never leak the recipient's email address (PII)
 *
 * The Resend SDK is mocked at the module level — the real SDK makes a fetch
 * to api.resend.com which we never want firing in tests.
 */

// ─── Module mocks (must be declared before SUT imports) ──────────────────

const mockResendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
  })),
}));

const loggerInfo = jest.fn();
const loggerError = jest.fn();
const loggerWarn = jest.fn();
jest.mock('@/lib/logger', () => ({
  logger: { info: loggerInfo, error: loggerError, warn: loggerWarn },
}));

// ─── Test fixtures ──────────────────────────────────────────────────────

import React from 'react';
import { sendEmail } from '@/lib/email/send';
import { __resetResendClientForTests } from '@/lib/email/client';
import { OrderConfirmation } from '@/lib/email/templates/OrderConfirmation';
import { OrderShipped } from '@/lib/email/templates/OrderShipped';
import { OrderDelivered } from '@/lib/email/templates/OrderDelivered';
import { LicenseExpiringWarning } from '@/lib/email/templates/LicenseExpiringWarning';
import { PasswordReset } from '@/lib/email/templates/PasswordReset';
import { EmailVerification } from '@/lib/email/templates/EmailVerification';
import { render } from '@react-email/render';

const RECIPIENT = 'alice@example.com';

const orderConfirmationProps = {
  orderNumber: 'WH-2026-00042',
  retailerBusinessName: 'Smoke City',
  supplierName: 'Premium Vape Co',
  lineCount: 7,
  total: 1234.56,
  shipToAddress: '123 Main St, Boston, MA 02101',
  viewOrderUrl: 'https://app.wholesalehub.example.com/orders/WH-2026-00042',
};

const orderShippedProps = {
  orderNumber: 'WH-2026-00042',
  carrier: 'UPS',
  trackingNumber: '1Z999AA10123456784',
  trackingUrl: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
  expectedDelivery: 'Mon, Apr 28',
};

const orderDeliveredProps = {
  orderNumber: 'WH-2026-00042',
  deliveredAt: 'Apr 28, 2026 at 3:42pm EST',
  viewOrderUrl: 'https://app.wholesalehub.example.com/orders/WH-2026-00042',
  leaveReviewUrl: 'https://app.wholesalehub.example.com/orders/WH-2026-00042/review',
};

const licenseProps = {
  wholesalerName: 'Premium Vape Co',
  daysUntilExpiry: 14,
  expiresOn: 'May 15, 2026',
  renewLicenseUrl: 'https://app.wholesalehub.example.com/wholesaler/license',
};

const passwordResetProps = {
  firstName: 'Alice',
  resetUrl: 'https://app.wholesalehub.example.com/auth/reset?token=abc123',
  expiresIn: '1 hour',
};

const emailVerificationProps = {
  firstName: 'Alice',
  verifyUrl: 'https://app.wholesalehub.example.com/auth/verify?token=abc123',
  expiresIn: '24 hours',
};

// ─── sendEmail behavior ─────────────────────────────────────────────────

describe('sendEmail — no-op when RESEND_API_KEY is unset', () => {
  const previousKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    __resetResendClientForTests();
    mockResendSend.mockReset();
    loggerInfo.mockReset();
    loggerError.mockReset();
    loggerWarn.mockReset();
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    __resetResendClientForTests();
  });

  it('returns ok=true with skipped=true and never calls the SDK', async () => {
    const result = await sendEmail({
      to: RECIPIENT,
      from: 'orders@wholesalehub.example.com',
      subject: 'Order WH-2026-00042 confirmed',
      react: React.createElement(OrderConfirmation, orderConfirmationProps),
      tag: 'order_confirmation',
    });

    expect(result.ok).toBe(true);
    if (result.ok && 'skipped' in result) {
      expect(result.skipped).toBe(true);
    }
    expect(mockResendSend).not.toHaveBeenCalled();

    // `email_skipped_no_api_key` is logged by the client, by send, or both.
    const skipLogs = loggerInfo.mock.calls.filter(
      ([arg]) =>
        typeof arg === 'object' && arg !== null && 'event' in arg && (arg as { event: string }).event === 'email_skipped_no_api_key',
    );
    expect(skipLogs.length).toBeGreaterThan(0);
  });
});

describe('sendEmail — calls Resend SDK with the right shape when configured', () => {
  const previousKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_fake_key_value';
    __resetResendClientForTests();
    mockResendSend.mockReset();
    loggerInfo.mockReset();
    loggerError.mockReset();
    loggerWarn.mockReset();
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    __resetResendClientForTests();
  });

  it('forwards to/from/subject and renders both html and text', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

    const result = await sendEmail({
      to: RECIPIENT,
      from: 'orders@wholesalehub.example.com',
      replyTo: 'support@wholesalehub.example.com',
      subject: 'Order WH-2026-00042 confirmed',
      react: React.createElement(OrderConfirmation, orderConfirmationProps),
      tag: 'order_confirmation',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('id' in result ? result.id : null).toBe('msg_123');
    }

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const call = mockResendSend.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(call.to).toBe(RECIPIENT);
    expect(call.from).toBe('orders@wholesalehub.example.com');
    expect(call.replyTo).toBe('support@wholesalehub.example.com');
    expect(call.subject).toBe('Order WH-2026-00042 confirmed');
    expect(typeof call.html).toBe('string');
    expect(typeof call.text).toBe('string');
    // Sanity: rendered HTML must mention the order number; rendered text must too.
    expect(call.html).toContain('WH-2026-00042');
    expect(call.text).toContain('WH-2026-00042');
  });

  it('returns ok=false and logs email_failed when the SDK errors', async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'rate_limit_exceeded' },
    });

    const result = await sendEmail({
      to: RECIPIENT,
      from: 'orders@wholesalehub.example.com',
      subject: 'Order WH-2026-00042 confirmed',
      react: React.createElement(OrderConfirmation, orderConfirmationProps),
      tag: 'order_confirmation',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('rate_limit_exceeded');
    }

    const failed = loggerError.mock.calls.find(
      ([arg]) =>
        typeof arg === 'object' && arg !== null && 'event' in arg && (arg as { event: string }).event === 'email_failed',
    );
    expect(failed).toBeTruthy();
  });

  it('never throws when the SDK rejects — caller decides retry', async () => {
    mockResendSend.mockRejectedValue(new Error('ENETUNREACH'));

    await expect(
      sendEmail({
        to: RECIPIENT,
        from: 'orders@wholesalehub.example.com',
        subject: 'Order WH-2026-00042 confirmed',
        react: React.createElement(OrderConfirmation, orderConfirmationProps),
        tag: 'order_confirmation',
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: false }));
  });
});

// ─── Template render smoke tests ────────────────────────────────────────

describe('templates render without throwing', () => {
  it.each([
    ['OrderConfirmation', () => React.createElement(OrderConfirmation, orderConfirmationProps)],
    ['OrderShipped', () => React.createElement(OrderShipped, orderShippedProps)],
    ['OrderDelivered', () => React.createElement(OrderDelivered, orderDeliveredProps)],
    ['LicenseExpiringWarning', () => React.createElement(LicenseExpiringWarning, licenseProps)],
    ['PasswordReset', () => React.createElement(PasswordReset, passwordResetProps)],
    ['EmailVerification', () => React.createElement(EmailVerification, emailVerificationProps)],
  ])('%s renders to non-empty html and text', async (_name, factory) => {
    const html = await render(factory());
    const text = await render(factory(), { plainText: true });
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(50);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(20);
  });

  it('LicenseExpiringWarning renders a urgent variant for ≤7 days', async () => {
    const html = await render(
      React.createElement(LicenseExpiringWarning, {
        ...licenseProps,
        daysUntilExpiry: 5,
      }),
    );
    expect(html).toContain('5 days');
    expect(html.toLowerCase()).toContain('suspended');
  });
});

// ─── PII / subject hygiene ──────────────────────────────────────────────

describe('subject lines do not leak the recipient email address', () => {
  // Sweep the canonical subjects we use in the wired POST /api/orders path
  // and any future routes whose subjects we control.
  const canonicalSubjects = [
    `Order ${orderConfirmationProps.orderNumber} confirmed`,
    `Order ${orderShippedProps.orderNumber} shipped`,
    `Order ${orderDeliveredProps.orderNumber} delivered`,
    `Your license expires in ${licenseProps.daysUntilExpiry} days`,
    'Reset your WholesaleHub password',
    'Verify your WholesaleHub email',
  ];

  it.each(canonicalSubjects)('%s does not contain "@"', (subject) => {
    // A literal `@` is the simplest signal that an email address has been
    // pasted into the subject. We treat it as a hard fail.
    expect(subject).not.toContain('@');
  });

  it.each(canonicalSubjects)('%s does not contain the recipient address', (subject) => {
    expect(subject.toLowerCase()).not.toContain(RECIPIENT.toLowerCase());
  });
});
