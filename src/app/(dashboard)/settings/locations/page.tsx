import { redirect } from 'next/navigation';
import { getAuthedUser } from '@/lib/session';
import { LocationsManager } from './LocationsManager';

/**
 * /settings/locations — Multi-Location Ship-To.
 * BACKEND DEPENDENCY: PR #19 (multi-location). Until merged, /api/retailer/locations
 * returns 404 — UI shows the empty state.
 */
export default async function LocationsPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'RETAILER') redirect('/');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">Ship-to locations</h1>
          <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
            Add every store address you want orders shipped to. The default
            location is used when you don&apos;t pick one at checkout.
          </p>
        </div>
      </header>
      <LocationsManager />
    </div>
  );
}
