'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Mail, Phone, Bell, Lock, Pencil, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationPreferences,
  type NotificationChannel,
  type NotificationCategoryKey,
} from '@/lib/notification-prefs';
import { cn } from '@/lib/utils';

interface Props {
  initialPreferences: NotificationPreferences;
  defaults: NotificationPreferences;
  contact: { email: string; phone: string | null };
}

/**
 * Replicates the prototype's matrix layout: rows = category, columns =
 * channel toggle. Mobile collapses to per-category cards. The save bar is
 * sticky and only enables when prefs differ from last saved.
 */
export function NotificationPreferencesForm({ initialPreferences, contact }: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(initialPreferences);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPreferences>(initialPreferences);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  const dirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

  const toggle = (category: NotificationCategoryKey, channel: NotificationChannel) => {
    setPrefs((current) => {
      const row = current[category] as Record<string, boolean | undefined>;
      const next = { ...row, [channel]: !row[channel] };
      return { ...current, [category]: next };
    });
  };

  const onDiscard = () => {
    setPrefs(savedPrefs);
    setError(null);
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/users/me/notification-prefs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefs),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? 'Save failed.');
        }
        setSavedPrefs(prefs);
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 3000);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-6 pb-24"
    >
      {/* Channel context: where SMS/email go */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Contact channels">
        <ContactCard
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          value={contact.email}
        />
        <ContactCard
          icon={<Phone className="h-4 w-4" />}
          label="SMS"
          value={contact.phone ?? 'No phone on file'}
          missing={!contact.phone}
        />
      </section>

      {/* Matrix — desktop */}
      <section
        className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden"
        aria-label="Notification matrix"
      >
        <div className="grid grid-cols-[1fr,100px,100px,100px] bg-gray-50 border-b border-gray-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3.5">
            Category
          </div>
          <ChannelHeader icon={<Bell className="h-3.5 w-3.5" />} label="In-app" />
          <ChannelHeader icon={<Mail className="h-3.5 w-3.5" />} label="Email" />
          <ChannelHeader icon={<Phone className="h-3.5 w-3.5" />} label="SMS" />
        </div>

        {NOTIFICATION_CATEGORIES.map((cat) => {
          const row = prefs[cat.key] as Record<string, boolean | undefined>;
          return (
            <div
              key={cat.key}
              className="grid grid-cols-[1fr,100px,100px,100px] border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
            >
              <CategoryLabel name={cat.label} description={cat.description} />
              {(['inApp', 'email', 'sms'] as const).map((channel) => {
                const allowed = (cat.channels as readonly string[]).includes(channel);
                const locked =
                  'lockedChannels' in cat &&
                  (cat.lockedChannels as readonly string[] | undefined)?.includes(channel);
                return (
                  <div key={channel} className="flex items-center justify-center px-2 py-4">
                    {allowed ? (
                      <ToggleSwitch
                        checked={Boolean(row[channel])}
                        onChange={() => toggle(cat.key as NotificationCategoryKey, channel)}
                        disabled={locked || pending}
                        locked={locked}
                        ariaLabel={`${cat.label} ${channel}`}
                      />
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      {/* Mobile — per-category cards */}
      <section className="md:hidden space-y-3" aria-label="Notification matrix (mobile)">
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const row = prefs[cat.key] as Record<string, boolean | undefined>;
          return (
            <div
              key={cat.key}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-dark">{cat.label}</h3>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{cat.description}</p>
              </div>
              <div className="space-y-2.5">
                {(['inApp', 'email', 'sms'] as const).map((channel) => {
                  const allowed = (cat.channels as readonly string[]).includes(channel);
                  if (!allowed) return null;
                  const locked =
                    'lockedChannels' in cat &&
                    (cat.lockedChannels as readonly string[] | undefined)?.includes(channel);
                  const ChannelIcon = channel === 'inApp' ? Bell : channel === 'email' ? Mail : Phone;
                  return (
                    <div
                      key={channel}
                      className="flex items-center justify-between py-1.5"
                    >
                      <div className="flex items-center gap-2 text-sm text-dark">
                        <ChannelIcon className="h-4 w-4 text-gray-400" />
                        <span className="capitalize">{channel === 'inApp' ? 'In-app' : channel}</span>
                        {locked && <Lock className="h-3 w-3 text-gray-400" />}
                      </div>
                      <ToggleSwitch
                        checked={Boolean(row[channel])}
                        onChange={() => toggle(cat.key as NotificationCategoryKey, channel)}
                        disabled={locked || pending}
                        locked={locked}
                        ariaLabel={`${cat.label} ${channel}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {error && <ErrorBanner title="Couldn't save preferences" message={error} />}

      {/* Sticky save bar */}
      <div
        className={cn(
          'sticky bottom-4 z-10 rounded-xl border px-4 py-3 flex items-center justify-between transition-all',
          dirty
            ? 'bg-white border-gray-200 shadow-md'
            : 'bg-gray-50 border-gray-200 shadow-none'
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm">
          {savedToast ? (
            <>
              <Check className="h-4 w-4 text-success" />
              <span className="text-success font-medium">Preferences saved.</span>
            </>
          ) : dirty ? (
            <>
              <AlertCircle className="h-4 w-4 text-status-warning" />
              <span className="text-gray-600">Unsaved changes.</span>
            </>
          ) : (
            <span className="text-gray-500">All changes saved.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={!dirty || pending}
          >
            Discard
          </Button>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={!dirty || pending}
            leftIcon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {pending ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ChannelHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 px-2 py-3.5 text-center inline-flex items-center justify-center gap-1.5">
      {icon}
      {label}
    </div>
  );
}

function CategoryLabel({ name, description }: { name: string; description: string }) {
  return (
    <div className="px-4 py-4">
      <p className="text-sm font-semibold text-dark">{name}</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
    </div>
  );
}

function ContactCard({
  icon,
  label,
  value,
  missing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        <p
          className={cn(
            'text-sm font-medium mt-0.5 truncate font-mono',
            missing ? 'text-status-warning' : 'text-dark'
          )}
        >
          {value}
        </p>
      </div>
      <Link
        href="/settings"
        className="text-xs text-brand-teal hover:text-brand-teal-dark hover:bg-brand-teal/10 px-2.5 py-1 rounded-md inline-flex items-center gap-1 flex-shrink-0"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </Link>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  locked,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  locked?: boolean;
  ariaLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={onChange}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
          'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2',
          checked ? 'bg-brand-blue' : 'bg-gray-300',
          disabled && 'opacity-70 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          )}
        />
      </button>
      {locked && (
        <Lock className="h-3.5 w-3.5 text-gray-400" aria-label="Always on" />
      )}
    </span>
  );
}
