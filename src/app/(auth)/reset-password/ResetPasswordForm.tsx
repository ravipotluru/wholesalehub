'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export function ResetPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // The API always returns 200 to prevent account enumeration. We treat
      // anything non-2xx as a transport error worth surfacing.
      if (!res.ok && res.status !== 404) {
        throw new Error('Could not send reset link. Try again in a moment.');
      }
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-6 bg-success/[0.06] border border-success/30 rounded-lg px-4 py-4 text-sm text-dark flex gap-3 items-start"
      >
        <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Check your inbox</p>
          <p className="text-gray-600 mt-1 leading-relaxed">
            If <strong>{email}</strong> matches an account, a reset link is on its way. The link
            expires in 30 minutes.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-brand-teal font-medium mt-3 hover:text-brand-teal-dark"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      {error && <ErrorBanner message={error} />}
      <Input
        type="email"
        label="Work email"
        placeholder="you@yourbusiness.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
        autoComplete="email"
      />
      <Button
        type="submit"
        variant="primary"
        size="md"
        className="w-full justify-center"
        disabled={pending || !email}
        rightIcon={
          pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />
        }
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-sm text-brand-teal font-medium hover:text-brand-teal-dark"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to sign in
      </Link>
      <div className="pt-4 mt-4 border-t border-dashed border-gray-200 text-xs text-gray-500 text-center leading-relaxed">
        Need help? Contact{' '}
        <a href="mailto:support@wholesalehub.com" className="text-brand-teal font-medium">
          support@wholesalehub.com
        </a>
      </div>
    </form>
  );
}
