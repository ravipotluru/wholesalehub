'use client';

import { useState } from 'react';

/** "Resend verification email" — POSTs the resend endpoint with a cooldown. */
export function ResendButton() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const onResend = async () => {
    setState('sending');
    try {
      const res = await fetch('/api/auth/verify-email', { method: 'POST' });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'sent') {
    return <span className="text-success font-medium">Sent — check your inbox.</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={onResend}
        disabled={state === 'sending'}
        className="text-brand-teal font-medium hover:text-brand-teal-dark disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending…' : 'Resend verification email'}
      </button>
      {state === 'error' && (
        <span className="block text-status-error mt-1">
          Couldn&apos;t send — wait a minute and try again.
        </span>
      )}
    </>
  );
}
