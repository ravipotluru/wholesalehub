import Link from 'next/link';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared split-canvas auth layout used by /verify-email, /reset-password, etc.
 * Left column = form, right column = brand + value-prop content.
 *
 * Mirrors docs/handoffs/bundle/project/Auth%20Screens.html.
 */
export function AuthShell({
  children,
  rightContent,
  rightGradient = 'blue-teal',
  showFooter = true,
}: {
  children: React.ReactNode;
  rightContent: React.ReactNode;
  rightGradient?: 'blue-teal' | 'teal-success' | 'blue-light';
  showFooter?: boolean;
}) {
  const gradientClass = {
    'blue-teal': 'from-brand-blue to-brand-teal',
    'teal-success': 'from-brand-teal to-success',
    'blue-light': 'from-brand-blue to-brand-blue-light',
  }[rightGradient];

  return (
    <div className="min-h-[100dvh] bg-[#FAFBFD] grid grid-cols-1 lg:grid-cols-[5fr_4fr]">
      <div className="flex flex-col p-8 sm:p-12 lg:p-14 min-h-[100dvh]">
        <BrandMark />
        <div className="flex-1 flex flex-col justify-center">
          <div className="max-w-sm w-full mx-auto">{children}</div>
        </div>
        {showFooter && (
          <p className="text-[11px] text-gray-400 text-center">
            © WholesaleHub {new Date().getFullYear()} ·{' '}
            <Link href="/privacy" className="hover:text-gray-600">
              Privacy
            </Link>{' '}
            ·{' '}
            <Link href="/terms" className="hover:text-gray-600">
              Terms
            </Link>
          </p>
        )}
      </div>
      <div
        className={cn(
          'hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden bg-gradient-to-br',
          gradientClass,
        )}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.10), transparent 50%), radial-gradient(circle at 20% 90%, rgba(245,127,23,0.20), transparent 50%)',
          }}
        />
        <BrandMark variant="dark" />
        <div className="relative">{rightContent}</div>
      </div>
    </div>
  );
}

export function BrandMark({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 group">
      <span
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center',
          variant === 'light' ? 'bg-brand-blue text-white' : 'bg-white/20 text-white',
        )}
      >
        <Package className="h-4 w-4" />
      </span>
      <span className="leading-tight">
        <span
          className={cn(
            'block text-base font-bold tracking-tight',
            variant === 'light' ? 'text-dark' : 'text-white',
          )}
        >
          WholesaleHub
        </span>
        <span
          className={cn(
            'block text-[10px] uppercase tracking-widest',
            variant === 'light' ? 'text-gray-500' : 'text-white/70',
          )}
        >
          B2B platform
        </span>
      </span>
    </Link>
  );
}

export function StatCards({
  cards,
}: {
  cards: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-3.5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white/10 border border-white/15 p-3.5 rounded-lg backdrop-blur-sm"
        >
          <p className="font-mono text-xl font-bold">{c.value}</p>
          <p className="text-[11px] opacity-85 mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

export function Quote({
  initials,
  body,
  attribution,
}: {
  initials: string;
  body: string;
  attribution: string;
}) {
  return (
    <div className="flex gap-3 items-start">
      <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold flex-shrink-0">
        {initials}
      </span>
      <p className="text-xs leading-relaxed opacity-90">
        &ldquo;{body}&rdquo;{' '}
        <strong className="block mt-1 opacity-100">{attribution}</strong>
      </p>
    </div>
  );
}
