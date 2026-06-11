import { redirect } from 'next/navigation';
import { NewPasswordForm } from './NewPasswordForm';
import { AuthShell } from '../../_components/AuthShell';
import { Monitor, Smartphone, Tablet, AlertTriangle } from 'lucide-react';

interface PageProps {
  searchParams: { token?: string };
}

/**
 * /reset-password/new?token=… — set a new password after the user clicks the
 * reset link. State 04 of the auth screens design.
 *
 * The token is validated server-side on submit (POST /api/auth/reset-password).
 * If missing, redirect to the request page.
 */
export default function NewPasswordPage({ searchParams }: PageProps) {
  const token = searchParams.token;
  if (!token) redirect('/reset-password');

  return (
    <AuthShell
      rightGradient="blue-light"
      rightContent={
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight mb-3">
              What &ldquo;sign out everywhere&rdquo; does
            </h2>
            <p className="text-sm opacity-90 leading-relaxed">
              If your password was compromised, this kicks any attacker out of every active session
              — phone, warehouse tablet, browser, anywhere.
            </p>
          </div>
          <div className="bg-white/10 border border-white/15 p-4 rounded-lg backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-wider opacity-80 mb-2.5">
              Active sessions · 4
            </p>
            <ul className="space-y-2 text-xs">
              <SessionRow icon={<Monitor className="h-3 w-3" />} label="Chrome · Mac" age="now" />
              <SessionRow
                icon={<Smartphone className="h-3 w-3" />}
                label="iPhone scanner"
                age="2h ago"
                muted
              />
              <SessionRow
                icon={<Tablet className="h-3 w-3" />}
                label="Warehouse iPad"
                age="yesterday"
                muted
              />
              <SessionRow
                icon={<AlertTriangle className="h-3 w-3" />}
                label="Unknown · Lagos"
                age="3d ago"
                warn
              />
            </ul>
          </div>
        </div>
      }
    >
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="text-sm text-gray-500 mt-2 leading-relaxed">
        You&apos;ll be signed out of all other sessions.
      </p>
      <NewPasswordForm token={token} />
    </AuthShell>
  );
}

function SessionRow({
  icon,
  label,
  age,
  muted,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  age: string;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <li
      className={
        warn
          ? 'flex justify-between text-[#FFB199]'
          : muted
          ? 'flex justify-between opacity-85'
          : 'flex justify-between'
      }
    >
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="opacity-70 font-mono">{age}</span>
    </li>
  );
}
