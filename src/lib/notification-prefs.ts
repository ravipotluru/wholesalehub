import { z } from 'zod';
import type { Prisma } from '@prisma/client';

/**
 * Notification preferences live as JSON on `User.notificationPreferences`.
 * Storing as JSON (not normalized rows) is deliberate: every category list
 * + channel list change becomes a code-only deploy, no migration. The shape
 * is fully validated by Zod on read AND write so a malformed JSON column
 * never leaks to the client.
 *
 * Three channels per category: in-app (always available), email (requires
 * verified email), SMS (requires verified phone). Add a category by adding
 * to `NOTIFICATION_CATEGORIES` and `notificationPreferencesSchema` below
 * — the UI auto-renders new rows.
 */

export const NOTIFICATION_CATEGORIES = [
  {
    key: 'orderUpdates',
    label: 'Order updates',
    description: 'Confirmed, shipped, and delivered status changes on your orders',
    channels: ['inApp', 'email', 'sms'] as const,
  },
  {
    key: 'priceDropAlerts',
    label: 'Price drop alerts',
    description: 'When a saved product gets cheaper at any wholesaler',
    channels: ['inApp', 'email', 'sms'] as const,
  },
  {
    key: 'stockAlerts',
    label: 'Stock alerts',
    description: 'Low stock or back-in-stock on saved products',
    channels: ['inApp', 'email', 'sms'] as const,
  },
  {
    key: 'discrepancyResolutions',
    label: 'Discrepancy resolutions',
    description: 'Updates on receiving discrepancies your team flagged',
    channels: ['inApp', 'email', 'sms'] as const,
  },
  {
    key: 'anomalyDigests',
    label: 'Anomaly digests',
    description: 'Weekly summary of pricing/order anomalies (admins, analysts)',
    channels: ['inApp', 'email'] as const,
  },
  {
    key: 'systemAnnouncements',
    label: 'System announcements',
    description: 'Outages, scheduled maintenance, and platform-wide changes',
    channels: ['inApp', 'email'] as const,
    lockedChannels: ['inApp'] as const,
  },
] as const;

export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORIES)[number]['key'];
export type NotificationChannel = 'inApp' | 'email' | 'sms';

const channelToggles = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  sms: z.boolean().optional(),
});

export const notificationPreferencesSchema = z.object({
  orderUpdates: channelToggles,
  priceDropAlerts: channelToggles,
  stockAlerts: channelToggles,
  discrepancyResolutions: channelToggles,
  anomalyDigests: channelToggles.omit({ sms: true }),
  systemAnnouncements: channelToggles.omit({ sms: true }),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/**
 * Hard-coded defaults that keep the user safe on first sign-in. We err on
 * the side of "useful but not spammy": critical (orders, system) opt-in for
 * email; nice-to-have (price drops, stock) opt-out. SMS is opt-in for every
 * category — phone numbers are precious.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  orderUpdates: { inApp: true, email: true, sms: false },
  priceDropAlerts: { inApp: true, email: false, sms: false },
  stockAlerts: { inApp: true, email: true, sms: false },
  discrepancyResolutions: { inApp: true, email: true, sms: false },
  anomalyDigests: { inApp: true, email: false },
  systemAnnouncements: { inApp: true, email: true },
};

/**
 * Read prefs off a User row, parsing through Zod so a malformed JSON column
 * (could happen if someone hand-edits the DB) cannot crash the route.
 * Falls back to defaults if missing or malformed; logs nothing here — the
 * caller decides whether to surface that.
 */
export function readPreferences(raw: Prisma.JsonValue | null | undefined): NotificationPreferences {
  if (raw == null) return DEFAULT_NOTIFICATION_PREFERENCES;
  const parsed = notificationPreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_PREFERENCES;
}

/**
 * Apply the "system announcements + in-app is always on" lock at the API
 * boundary so nobody can disable critical messages by hand-crafting a
 * payload. The UI also greys out the toggle, but this is the load-bearing
 * enforcement.
 */
export function enforceLocks(prefs: NotificationPreferences): NotificationPreferences {
  return {
    ...prefs,
    systemAnnouncements: { ...prefs.systemAnnouncements, inApp: true },
  };
}
