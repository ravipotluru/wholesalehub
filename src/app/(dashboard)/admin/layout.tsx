'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  GitBranch,
  FlaskConical,
  Cpu,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const adminTabs = [
  { label: 'Audit Trail', href: '/admin/audit', icon: Shield },
  { label: 'Data Lineage', href: '/admin/lineage', icon: GitBranch },
  { label: 'Evaluations', href: '/admin/evaluations', icon: FlaskConical },
  { label: 'LLMOps', href: '/admin/llmops', icon: Cpu },
  { label: 'Anomalies', href: '/admin/anomalies', icon: AlertTriangle },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Admin Sub-Navigation */}
      <nav className="border-b border-gray-200 bg-white rounded-t-xl shadow-sm">
        <div className="flex items-center gap-0 overflow-x-auto px-2">
          {adminTabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-200',
                  isActive
                    ? 'border-brand-blue text-brand-blue'
                    : 'border-transparent text-gray-500 hover:text-brand-blue hover:border-gray-300'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Page Content */}
      {children}
    </div>
  );
}
