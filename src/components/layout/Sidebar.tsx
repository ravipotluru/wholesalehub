'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Search, ShoppingCart, Package, ClipboardList,
  BarChart3, Users, Settings, Warehouse, X, DollarSign, Inbox,
  Bell, Shield, FlaskConical, Cpu, AlertTriangle
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { label: 'Marketplace', href: '/marketplace', icon: Search, roles: ['ADMIN', 'RETAILER'] },
      { label: 'Cart', href: '/cart', icon: ShoppingCart, roles: ['RETAILER'] },
      { label: 'Orders', href: '/orders', icon: Package, roles: ['ADMIN', 'RETAILER', 'WHOLESALER'] },
      { label: 'My Products', href: '/products', icon: Package, roles: ['WHOLESALER'] },
      { label: 'Import Catalog', href: '/products/import', icon: ClipboardList, roles: ['WHOLESALER'] },
      { label: 'Pricing', href: '/pricing', icon: DollarSign, roles: ['WHOLESALER'] },
      { label: 'Incoming Orders', href: '/incoming-orders', icon: Inbox, roles: ['WHOLESALER'] },
      { label: 'Inventory', href: '/inventory', icon: Warehouse, roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      { label: 'Suppliers', href: '/suppliers', icon: Users, roles: ['ADMIN'] },
      { label: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['ADMIN', 'ANALYST'] },
      { label: 'Notifications', href: '/notifications', icon: Bell, roles: ['ADMIN', 'RETAILER', 'WHOLESALER', 'WAREHOUSE_STAFF', 'ANALYST'] },
      { label: 'Settings', href: '/settings', icon: Settings, roles: ['ADMIN', 'RETAILER', 'WHOLESALER', 'WAREHOUSE_STAFF', 'ANALYST'] },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Verification', href: '/settings/verification', icon: Shield, roles: ['RETAILER'] },
      { label: 'Locations', href: '/settings/locations', icon: Warehouse, roles: ['RETAILER'] },
      { label: 'Notification Prefs', href: '/settings/notifications', icon: Bell, roles: ['ADMIN', 'RETAILER', 'WHOLESALER', 'WAREHOUSE_STAFF', 'ANALYST'] },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Verification Queue', href: '/admin/verification', icon: ClipboardList, roles: ['ADMIN'] },
      { label: 'Audit Trail', href: '/admin/audit', icon: Shield, roles: ['ADMIN'] },
      { label: 'Evaluations', href: '/admin/evaluations', icon: FlaskConical, roles: ['ADMIN'] },
      { label: 'LLMOps', href: '/admin/llmops', icon: Cpu, roles: ['ADMIN'] },
      { label: 'Anomalies', href: '/admin/anomalies', icon: AlertTriangle, roles: ['ADMIN'] },
      { label: 'Design Gallery', href: '/design-gallery', icon: LayoutDashboard, roles: ['ADMIN'] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { mobileSidebarOpen, closeMobileSidebar } = useUIStore();
  const role = (session?.user as Record<string, unknown>)?.role as string;

  const filteredSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-brand-blue">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/10">
        <Link href="/marketplace" className="flex items-center gap-2" onClick={closeMobileSidebar}>
          <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
            <Package className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-lg font-bold">WholesaleHub</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {filteredSections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {section.title && (
              <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileSidebar}
                    className={cn(
                      'nav-link',
                      isActive ? 'nav-link-active' : 'nav-link-inactive'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10">
        <p className="text-xs text-white/50">WholesaleHub v1.0</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 fixed inset-y-0 left-0 z-40">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/50" onClick={closeMobileSidebar} />
          <aside className="fixed inset-y-0 left-0 w-64 z-50">
            <button
              onClick={closeMobileSidebar}
              className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded z-50"
            >
              <X className="h-5 w-5 text-white" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
