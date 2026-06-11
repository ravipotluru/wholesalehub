'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';

interface PasswordChecks {
  length: boolean;
  mixedCase: boolean;
  hasNumber: boolean;
  notCommon: boolean;
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty',
  'qwertyui',
  'letmein',
  'welcome',
  'admin123',
]);

function evaluate(pw: string): PasswordChecks {
  return {
    length: pw.length >= 12,
    mixedCase: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    // Server policy (resetPasswordSchema) requires a DIGIT specifically —
    // symbols alone don't satisfy it, so the checklist must match.
    hasNumber: /[0-9]/.test(pw),
    notCommon: pw.length > 0 && !COMMON_PASSWORDS.has(pw.toLowerCase()),
  };
}

export function NewPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [signOutEverywhere, setSignOutEverywhere] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = useMemo(() => evaluate(pw), [pw]);
  const checksMet = Object.values(checks).filter(Boolean).length;
  const matches = pw.length > 0 && pw === confirm;
  const canSubmit = checksMet === 4 && matches && !pending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw, signOutEverywhere }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(
          body.error?.message ??
            'Reset link is invalid or expired. Request a new one.',
        );
      }
      router.push('/login?reset=ok');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3.5">
      {error && <ErrorBanner message={error} />}

      <div>
        <label className="block text-xs font-semibold mb-1.5 text-gray-700">New password</label>
        <div className="relative">
          <Input
            type={showPw ? 'text' : 'password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            autoFocus
            className={cn(checksMet === 4 && 'border-success focus:border-success')}
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-dark p-1"
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                'flex-1 h-1 rounded-sm',
                i < checksMet
                  ? checksMet === 4
                    ? 'bg-success'
                    : checksMet >= 2
                    ? 'bg-brand-orange'
                    : 'bg-status-error'
                  : 'bg-gray-200',
              )}
            />
          ))}
        </div>
        <ul className="mt-2 space-y-1 text-[11px] text-gray-500">
          <CheckLine met={checks.length}>At least 12 characters</CheckLine>
          <CheckLine met={checks.mixedCase}>Mixed case</CheckLine>
          <CheckLine met={checks.hasNumber}>Contains a number</CheckLine>
          <CheckLine met={checks.notCommon}>Not a common password</CheckLine>
        </ul>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5 text-gray-700">
          Confirm new password
        </label>
        <Input
          type={showPw ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={cn(
            confirm.length > 0 && (matches ? 'border-success focus:border-success' : 'border-status-error'),
          )}
        />
        {confirm.length > 0 && (
          <p
            className={cn(
              'text-[11px] mt-1.5 inline-flex items-center gap-1',
              matches ? 'text-success' : 'text-status-error',
            )}
          >
            {matches ? (
              <>
                <Check className="h-3 w-3" />
                Passwords match
              </>
            ) : (
              <>Passwords don&apos;t match</>
            )}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={signOutEverywhere}
          onChange={(e) => setSignOutEverywhere(e.target.checked)}
          className="rounded text-brand-blue focus:ring-brand-blue"
        />
        Sign me out of all other devices (recommended)
      </label>

      <Button
        type="submit"
        variant="primary"
        size="md"
        className="w-full justify-center"
        disabled={!canSubmit}
        rightIcon={
          pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />
        }
      >
        {pending ? 'Updatingâ€¦' : 'Update password & sign in'}
      </Button>
    </form>
  );
}

function CheckLine({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        'flex items-center gap-1.5',
        met ? 'text-success' : 'text-gray-500',
      )}
    >
      <Check className={cn('h-3 w-3', met ? 'opacity-100' : 'opacity-30')} />
      {children}
    </li>
  );
}
