import Link from 'next/link';
import { Check, ArrowRight, FileText, Hash, Award, Building, ShieldCheck, XCircle } from 'lucide-react';
import { getAuthedUser } from '@/lib/session';
import { AuthShell } from '../../_components/AuthShell';

interface PageProps {
  searchParams: { verified?: string; t?: string };
}

/**
 * /verify-email/confirm?verified=0|1 — landing page after the user clicks the
 * emailed verification link (GET /api/auth/verify-email consumes the token and
 * redirects here with the outcome).
 *
 * PUBLIC route (whitelisted in middleware): the click usually comes from a
 * mail client with no session cookie. Session, when present, only enriches
 * the copy — it is never required.
 */
export default async function VerifyEmailConfirmPage({ searchParams }: PageProps) {
  const user = await getAuthedUser(); // may be null — fine
  const failed = searchParams.verified === '0';

  if (failed) {
    return (
      <AuthShell
        rightGradient="blue-teal"
        rightContent={
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">
              Links expire after 24 hours
            </h2>
            <p className="text-sm opacity-90 leading-relaxed max-w-xs">
              For your security, each verification link works exactly once and only for a day.
              Request a fresh one and you&apos;ll be verified in seconds.
            </p>
          </div>
        }
      >
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-status-error/[0.10] text-status-error flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">This link didn&apos;t work</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            The verification link is invalid, expired, or was already used. Sign in and we&apos;ll
            send you a fresh one.
          </p>
          <Link
            href={user ? '/verify-email' : '/login'}
            className="mt-5 inline-flex items-center justify-center gap-2 w-full px-6 py-3 text-sm rounded-lg bg-brand-blue text-white hover:bg-brand-blue-dark font-semibold transition-colors"
          >
            {user ? 'Resend verification email' : 'Sign in to resend'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      rightGradient="teal-success"
      rightContent={
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight mb-3">
              What you&apos;ll need for license upload
            </h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 opacity-85 flex-shrink-0" />
                Resale certificate (state-issued)
              </li>
              <li className="flex items-center gap-2.5">
                <Hash className="h-4 w-4 opacity-85 flex-shrink-0" />
                Federal EIN (9 digits)
              </li>
              <li className="flex items-center gap-2.5">
                <Award className="h-4 w-4 opacity-85 flex-shrink-0" />
                Tobacco/vape license (if applicable)
              </li>
              <li className="flex items-center gap-2.5">
                <Building className="h-4 w-4 opacity-85 flex-shrink-0" />
                Ship-to address(es)
              </li>
            </ul>
            <p className="text-xs opacity-90 mt-4">
              Most uploads are reviewed within <strong>4 business hours</strong>. You&apos;ll get
              an email when approved.
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <p className="text-xs leading-relaxed opacity-90">
              All documents are encrypted at rest. We never share license info with other buyers
              or sellers.
            </p>
          </div>
        </div>
      }
    >
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-success/[0.10] text-success flex items-center justify-center mx-auto mb-4 relative">
          <Check className="h-10 w-10" />
          <span className="absolute -inset-1.5 rounded-full border-2 border-success/25" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Email verified</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          {user
            ? `Welcome${user.email ? `, ${user.email.split('@')[0]}` : ''}. Your account is active. Next: upload your business documents to unlock ordering.`
            : 'Your email is verified. Sign in to continue setting up your account.'}
        </p>

        {user ? (
          <>
            <div className="bg-[#FAFBFD] border border-gray-200 rounded-lg p-3.5 mt-5 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2.5">
                Onboarding · 1 of 3
              </p>
              <ol className="space-y-2">
                <OnboardStep done label="Verify email" />
                <OnboardStep current label="Upload business documents" />
                <OnboardStep label="Browse catalog & place order" idx={3} />
              </ol>
            </div>
            <Link
              href="/settings/verification"
              className="mt-5 inline-flex items-center justify-center gap-2 w-full px-6 py-3 text-sm rounded-lg bg-brand-orange text-white hover:bg-brand-orange-dark font-semibold transition-colors"
            >
              Continue to license upload
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/marketplace"
              className="block text-center text-xs text-brand-teal font-medium mt-3.5 hover:text-brand-teal-dark"
            >
              Skip for now (limited browsing)
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="mt-5 inline-flex items-center justify-center gap-2 w-full px-6 py-3 text-sm rounded-lg bg-brand-orange text-white hover:bg-brand-orange-dark font-semibold transition-colors"
          >
            Sign in to continue
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </AuthShell>
  );
}

function OnboardStep({
  done,
  current,
  label,
  idx = 2,
}: {
  done?: boolean;
  current?: boolean;
  label: string;
  idx?: number;
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span
        className={
          done
            ? 'w-[18px] h-[18px] rounded-full bg-success text-white flex items-center justify-center'
            : current
            ? 'w-[18px] h-[18px] rounded-full bg-brand-blue text-white flex items-center justify-center font-mono text-[10px] font-bold'
            : 'w-[18px] h-[18px] rounded-full bg-gray-200 flex items-center justify-center font-mono text-[10px] font-bold text-gray-500'
        }
      >
        {done ? <Check className="h-2.5 w-2.5" /> : current ? '2' : idx}
      </span>
      <span
        className={
          done ? 'line-through text-gray-500' : current ? 'font-medium' : 'text-gray-400'
        }
      >
        {label}
      </span>
    </li>
  );
}
