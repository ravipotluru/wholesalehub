import Link from 'next/link';
import { Mail, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { getAuthedUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { AuthShell, StatCards, Quote } from '../_components/AuthShell';

/**
 * /verify-email — post-signup waiting screen.
 * Mirrors state 01 of docs/handoffs/bundle/project/Auth%20Screens.html.
 */
export default async function VerifyEmailPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  // NOTE: when an `emailVerified` flag lands on the session shape, gate this
  // page on it and redirect already-verified users straight to /onboarding.

  return (
    <AuthShell
      rightContent={
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight mb-3">
              You&apos;re 3 steps from your first wholesale order
            </h2>
            <p className="text-sm opacity-90 leading-relaxed max-w-xs">
              Verify email · upload license · place order. Most retailers complete onboarding in
              under 8 minutes.
            </p>
          </div>
          <StatCards
            cards={[
              { value: '320+', label: 'Verified wholesalers' },
              { value: '8 min', label: 'Avg. setup time' },
              { value: 'Net-30', label: 'Default terms' },
            ]}
          />
          <Quote
            initials="MR"
            body="License verified the same day. We placed our first order by 4pm."
            attribution="Maya R · Cleveland Tobacco Co"
          />
        </div>
      }
    >
      <div className="text-center">
        <div className="w-20 h-20 rounded-2xl bg-brand-blue/[0.08] text-brand-blue flex items-center justify-center mx-auto mb-4 relative">
          <Mail className="h-9 w-9" />
          <span
            className="absolute -inset-1 rounded-[20px] border-2 border-dashed border-brand-blue/25 animate-spin"
            style={{ animationDuration: '18s' }}
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          We sent a verification link to <strong className="text-dark">{user.email}</strong>. Click
          it to activate your account — link expires in 24 hours.
        </p>

        <div className="mt-5 text-left bg-brand-blue/[0.04] border border-brand-blue/[0.15] rounded-lg px-3.5 py-3 flex gap-2.5 text-xs text-gray-700">
          <Info className="h-3.5 w-3.5 text-brand-blue flex-shrink-0 mt-0.5" />
          <p>
            Verification is required by Ohio tobacco wholesaler regs. After clicking, you&apos;ll
            upload your resale certificate and tobacco license to start ordering.
          </p>
        </div>

        <a
          href="https://mail.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center gap-2 w-full px-6 py-3 text-sm rounded-lg border border-gray-300 text-dark hover:bg-gray-50 font-semibold transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Gmail
        </a>

        <p className="text-xs text-gray-400 mt-3.5">
          Didn&apos;t get it?{' '}
          <button type="button" className="text-brand-teal font-medium hover:text-brand-teal-dark">
            Resend verification email
          </button>
        </p>

        <p className="text-[11px] text-gray-400 mt-4">
          Wrong email?{' '}
          <Link href="/login" className="text-gray-500 underline">
            Sign out & restart
          </Link>
        </p>

        <div className="mt-6 inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <ShieldCheck className="h-3 w-3" />
          Your data is encrypted at rest and in transit
        </div>
      </div>
    </AuthShell>
  );
}
