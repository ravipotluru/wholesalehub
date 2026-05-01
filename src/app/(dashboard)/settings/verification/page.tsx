import { redirect } from 'next/navigation';
import { getAuthedUser } from '@/lib/session';
import { BuyerVerificationView } from './BuyerVerificationView';

/**
 * /settings/verification — Buyer Verification.
 *
 * BACKEND DEPENDENCY: requires PR #17 (buyer-verification) to be merged.
 * Until then, the API endpoints used here (/api/buyer/documents,
 * /api/buyer/verification-status) return 404. The UI handles that
 * gracefully and shows the empty/unverified state.
 */
export default async function BuyerVerificationPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'RETAILER') redirect('/');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
          Buyer verification
        </h1>
        <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
          Upload your resale certificate, EIN letter, and state tobacco license to
          unlock age-restricted SKUs at checkout. Most submissions are reviewed in
          one business day.
        </p>
      </header>
      <BuyerVerificationView />
    </div>
  );
}
