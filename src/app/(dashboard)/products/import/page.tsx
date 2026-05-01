import { redirect } from 'next/navigation';
import { getAuthedUser } from '@/lib/session';
import { CsvImportWizard } from './CsvImportWizard';

/**
 * /products/import — Catalog CSV Import wizard.
 * Wholesalers bulk-upload SKUs (4-step wizard with 5 states: upload, map,
 * preview/fix, importing, result). Mirrors docs/handoffs/bundle/project/Catalog%20CSV%20Import.html.
 *
 * BACKEND DEPENDENCY: requires /api/products/import (PR #10, draft) for
 * upload + preview + commit. Until merged, the UI runs in client-only
 * "demo" mode that doesn't actually persist — the wizard surface is real,
 * the writes are stubbed.
 */
export default async function ProductsImportPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'WHOLESALER' && user.role !== 'ADMIN') redirect('/products');

  return (
    <div className="bg-[#EFF1F4] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
            Wholesaler · Catalog
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
            Catalog CSV import
          </h1>
          <p className="mt-1.5 text-sm text-gray-500 leading-relaxed max-w-2xl">
            Bulk-upload products from a CSV. We&apos;ll preview every row and only commit
            clean ones — anything still red gets reported and skipped.
          </p>
        </header>
        <CsvImportWizard />
      </div>
    </div>
  );
}
