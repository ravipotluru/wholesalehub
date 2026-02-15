'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Star,
  MapPin,
  Mail,
  Users,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, debounce } from '@/lib/utils';

// ---------- Types ----------
interface Supplier {
  id: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  city: string;
  state: string;
  ratingAvg: number;
  ratingCount: number;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
}

// ---------- Mock Data ----------
const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: '1',
    businessName: 'Pacific Wholesale Distribution',
    contactName: 'James Chen',
    contactEmail: 'james@pacificwholesale.com',
    city: 'Los Angeles',
    state: 'CA',
    ratingAvg: 4.8,
    ratingCount: 156,
    status: 'ACTIVE',
  },
  {
    id: '2',
    businessName: 'National Tobacco Supply Co.',
    contactName: 'Maria Rodriguez',
    contactEmail: 'maria@ntstobacco.com',
    city: 'Houston',
    state: 'TX',
    ratingAvg: 4.6,
    ratingCount: 132,
    status: 'ACTIVE',
  },
  {
    id: '3',
    businessName: 'SmokeWave Distributors',
    contactName: 'Kevin Park',
    contactEmail: 'kevin@smokewave.com',
    city: 'Atlanta',
    state: 'GA',
    ratingAvg: 4.5,
    ratingCount: 98,
    status: 'ACTIVE',
  },
  {
    id: '4',
    businessName: 'Empire Glass & Accessories',
    contactName: 'Sarah Williams',
    contactEmail: 'sarah@empireglass.com',
    city: 'Denver',
    state: 'CO',
    ratingAvg: 4.3,
    ratingCount: 74,
    status: 'ACTIVE',
  },
  {
    id: '5',
    businessName: 'Delta Vape Supply',
    contactName: 'Michael Torres',
    contactEmail: 'michael@deltavape.com',
    city: 'Miami',
    state: 'FL',
    ratingAvg: 4.7,
    ratingCount: 112,
    status: 'ACTIVE',
  },
  {
    id: '6',
    businessName: 'Northeast Wholesale Group',
    contactName: 'David Kim',
    contactEmail: 'david@newholesale.com',
    city: 'Newark',
    state: 'NJ',
    ratingAvg: 4.1,
    ratingCount: 45,
    status: 'INACTIVE',
  },
  {
    id: '7',
    businessName: 'Sunset Distribution LLC',
    contactName: 'Lisa Nguyen',
    contactEmail: 'lisa@sunsetdist.com',
    city: 'Phoenix',
    state: 'AZ',
    ratingAvg: 0,
    ratingCount: 0,
    status: 'PENDING',
  },
];

// ---------- Helpers ----------
function StarRating({ rating, count }: { rating: number; count: number }) {
  if (count === 0) {
    return <span className="text-xs text-gray-400">No ratings yet</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < Math.round(rating)
              ? 'fill-brand-orange text-brand-orange'
              : 'fill-gray-200 text-gray-200'
          )}
        />
      ))}
      <span className="ml-1 text-xs font-medium text-gray-500">
        {rating.toFixed(1)} ({count})
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: Supplier['status'] }) {
  const config: Record<Supplier['status'], { variant: 'success' | 'error' | 'warning'; label: string }> = {
    ACTIVE: { variant: 'success', label: 'Active' },
    INACTIVE: { variant: 'error', label: 'Inactive' },
    PENDING: { variant: 'warning', label: 'Pending' },
  };
  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// ---------- Loading Skeleton ----------
function SuppliersSkeleton() {
  return (
    <Card padding="none" className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/50">
            <th className="px-6 py-3 text-left"><Skeleton className="w-20 h-3" /></th>
            <th className="px-6 py-3 text-left"><Skeleton className="w-24 h-3" /></th>
            <th className="px-6 py-3 text-left"><Skeleton className="w-16 h-3" /></th>
            <th className="px-6 py-3 text-left"><Skeleton className="w-12 h-3" /></th>
            <th className="px-6 py-3 text-left"><Skeleton className="w-12 h-3" /></th>
            <th className="px-6 py-3 text-left"><Skeleton className="w-20 h-3" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRowSkeleton key={i} cols={6} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------- Main Page ----------
export default function SuppliersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const debouncedSetSearch = debounce((value: string) => {
    setDebouncedSearch(value);
  }, 300);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    debouncedSetSearch(value);
  };

  // Fetch suppliers
  const { data: suppliers, isLoading, error, refetch } = useQuery<Supplier[]>({
    queryKey: ['suppliers', debouncedSearch],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('q', debouncedSearch);
        const res = await fetch(`/api/suppliers?${params.toString()}`);
        if (!res.ok) throw new Error('API not available');
        return res.json();
      } catch {
        // Fallback to mock data
        const term = debouncedSearch.toLowerCase();
        if (!term) return MOCK_SUPPLIERS;
        return MOCK_SUPPLIERS.filter(
          (s) =>
            s.businessName.toLowerCase().includes(term) ||
            s.contactName.toLowerCase().includes(term) ||
            s.city.toLowerCase().includes(term) ||
            s.state.toLowerCase().includes(term)
        );
      }
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">Suppliers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage wholesale supplier directory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-brand-teal" />
          <span className="text-sm text-gray-500">
            {suppliers?.length ?? 0} supplier{(suppliers?.length ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search suppliers by name, city, state..."
          className="input-field pl-12 h-11"
        />
        {searchTerm && (
          <button
            onClick={() => handleSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <ErrorBanner
          message="Failed to load suppliers. Please try again."
          onRetry={() => refetch()}
        />
      )}

      {/* Loading State */}
      {isLoading && <SuppliersSkeleton />}

      {/* Empty State */}
      {!isLoading && !error && suppliers?.length === 0 && (
        <EmptyState
          icon="search"
          title="No suppliers found"
          description={
            debouncedSearch
              ? `No suppliers match "${debouncedSearch}". Try a different search term.`
              : 'No suppliers have been added yet.'
          }
          actionLabel={debouncedSearch ? 'Clear search' : undefined}
          onAction={debouncedSearch ? () => handleSearch('') : undefined}
        />
      )}

      {/* Suppliers Table */}
      {!isLoading && !error && suppliers && suppliers.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Business Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Rating
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-brand-blue">
                            {supplier.businessName.charAt(0)}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-dark">{supplier.businessName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {supplier.contactName}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                        {supplier.city}, {supplier.state}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StarRating rating={supplier.ratingAvg} count={supplier.ratingCount} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={supplier.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-brand-teal">
                        <Mail className="h-3.5 w-3.5" />
                        {supplier.contactEmail}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
