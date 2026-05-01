import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import {
  readPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/lib/notification-prefs';
import { NotificationPreferencesForm } from './NotificationPreferencesForm';

/**
 * Server Component shell for /settings/notifications. Fetches the user's
 * current preferences + contact info on the server (no client-side waterfall),
 * then hands the data to the Client Component which owns toggles + save state.
 */
export default async function NotificationsSettingsPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationPreferences: true, email: true, phone: true },
  });
  if (!row) redirect('/login');

  const initialPreferences = readPreferences(row.notificationPreferences);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
          Notification preferences
        </h1>
        <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
          Control how WholesaleHub contacts you. Toggle each category and channel,
          then save.
        </p>
      </header>

      <NotificationPreferencesForm
        initialPreferences={initialPreferences}
        defaults={DEFAULT_NOTIFICATION_PREFERENCES}
        contact={{ email: row.email, phone: row.phone ?? null }}
      />
    </div>
  );
}
