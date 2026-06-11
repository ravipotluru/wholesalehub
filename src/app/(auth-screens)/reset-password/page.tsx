import { ResetPasswordForm } from './ResetPasswordForm';
import { AuthShell } from '../_components/AuthShell';
import { LockKeyhole, Check } from 'lucide-react';

/**
 * /reset-password — request a password reset link.
 * State 03 of the auth screens design. Generic responses (don't leak account
 * existence) — the API route always returns 200 regardless of email match.
 */
export default function ResetPasswordPage() {
  return (
    <AuthShell
      rightContent={
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight mb-3">
              Tip: most password issues come from auto-fill
            </h2>
            <p className="text-sm opacity-90 leading-relaxed">
              If your browser saved an old password, the new one won&apos;t stick. After resetting,
              update your password manager so 1Password / LastPass / Apple Keychain remembers the
              right one.
            </p>
          </div>
          <div className="bg-white/10 border border-white/15 p-4 rounded-lg backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-wider opacity-80 mb-2">Security tips</p>
            <ul className="space-y-1.5 text-xs leading-relaxed">
              <SecurityTip>Use a unique password for WholesaleHub</SecurityTip>
              <SecurityTip>Enable 2FA in account settings after login</SecurityTip>
              <SecurityTip>Never share login over email or Slack</SecurityTip>
            </ul>
          </div>
        </div>
      }
    >
      <div>
        <div className="w-20 h-20 rounded-2xl bg-brand-orange/[0.08] text-brand-orange flex items-center justify-center mx-auto mb-4">
          <LockKeyhole className="h-9 w-9" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-center">Reset your password</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed text-center">
          Enter the email tied to your account. If it matches, we&apos;ll send a reset link valid
          for 30 minutes.
        </p>
        <ResetPasswordForm />
      </div>
    </AuthShell>
  );
}

function SecurityTip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 items-start">
      <Check className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}
