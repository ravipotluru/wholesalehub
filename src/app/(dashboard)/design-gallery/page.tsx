import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthedUser } from '@/lib/session';
import {
  ShoppingBag,
  Building2,
  Package,
  Shield,
  Bell,
  ScanBarcode,
  FileSpreadsheet,
  DollarSign,
  MapPin,
  CheckCircle2,
  CircleDashed,
  Construction,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * /design-gallery — internal admin page that mirrors the index.html
 * prototype from docs/handoffs/bundle/. Tracks where each P0 screen
 * lives (Implemented / Designed / Not started) and links the live
 * version. Use this as the source-of-truth dashboard for the UI rollout.
 *
 * Auth: ADMIN only.
 */

type Status = 'implemented' | 'designed' | 'not-started';

interface Screen {
  name: string;
  audience: 'Retailer' | 'Wholesaler' | 'Warehouse' | 'Admin' | 'Shared';
  route: string;
  status: Status;
  prototype?: string;
  description: string;
}

const SCREENS: ReadonlyArray<Screen> = [
  // Retailer
  {
    name: 'Notification preferences',
    audience: 'Shared',
    route: '/settings/notifications',
    status: 'implemented',
    prototype: 'docs/handoffs/bundle/project/Notification Preferences.html',
    description: 'Per-category, per-channel toggles. Sticky save bar.',
  },
  {
    name: 'Buyer verification',
    audience: 'Retailer',
    route: '/settings/verification',
    status: 'designed',
    prototype: 'docs/handoffs/bundle/project/Buyer Verification.html',
    description: 'Resale cert + EIN + tobacco license upload + status.',
  },
  {
    name: 'Multi-location ship-to',
    audience: 'Retailer',
    route: '/settings/locations',
    status: 'designed',
    prototype: 'docs/handoffs/bundle/project/Multi-Location Ship-To.html',
    description: 'Manage chain ship-to addresses. CRUD + default flag.',
  },
  // Wholesaler
  {
    name: 'Catalog CSV import',
    audience: 'Wholesaler',
    route: '/products/import',
    status: 'designed',
    prototype: 'docs/handoffs/bundle/project/Catalog CSV Import.html',
    description: '4-step wizard: upload → preview → commit → report.',
  },
  {
    name: 'Tier pricing editor',
    audience: 'Wholesaler',
    route: '/products/[id]/edit',
    status: 'designed',
    prototype: 'docs/handoffs/bundle/project/Tier Pricing Editor.html',
    description: 'Quantity-break ladder inside the product edit form.',
  },
  // Warehouse
  {
    name: 'Mobile barcode scanner',
    audience: 'Warehouse',
    route: '/inventory/receive/[id]/scan',
    status: 'implemented',
    prototype: 'docs/handoffs/bundle/project/Mobile Barcode Scanner.html',
    description: 'Camera scanner + offline queue + discrepancy sheet.',
  },
  // Admin
  {
    name: 'Admin verification queue',
    audience: 'Admin',
    route: '/admin/verification',
    status: 'designed',
    prototype: 'docs/handoffs/bundle/project/Admin Verification Queue.html',
    description: 'Approve/reject buyer documents. Sortable, paginated.',
  },
  // Shared
  {
    name: 'Auth screens',
    audience: 'Shared',
    route: '/login, /register, /reset',
    status: 'designed',
    prototype: 'docs/handoffs/bundle/project/Auth Screens.html',
    description: 'Sign in / sign up / forgot password. Refreshed visuals.',
  },
];

const PERSONA_GROUPS: ReadonlyArray<{
  audience: Screen['audience'];
  icon: React.ReactNode;
  label: string;
}> = [
  { audience: 'Retailer', icon: <ShoppingBag className="h-4 w-4" />, label: 'Retailer (buyer)' },
  { audience: 'Wholesaler', icon: <Building2 className="h-4 w-4" />, label: 'Wholesaler (seller)' },
  { audience: 'Warehouse', icon: <Package className="h-4 w-4" />, label: 'Warehouse staff' },
  { audience: 'Admin', icon: <Shield className="h-4 w-4" />, label: 'Admin' },
  { audience: 'Shared', icon: <Bell className="h-4 w-4" />, label: 'Shared' },
];

export default async function DesignGalleryPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');

  const counts = {
    implemented: SCREENS.filter((s) => s.status === 'implemented').length,
    designed: SCREENS.filter((s) => s.status === 'designed').length,
    notStarted: SCREENS.filter((s) => s.status === 'not-started').length,
    total: SCREENS.length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
          Design gallery
        </h1>
        <p className="mt-1.5 text-sm text-gray-500 leading-relaxed max-w-2xl">
          Eight P0 flows designed in Claude Design. Implementation status tracked here.
          Links jump to the live route; prototypes ship in <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">docs/handoffs/bundle/project/</code>.
        </p>
      </header>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <SummaryCard label="Implemented" value={counts.implemented} accent="success" />
        <SummaryCard label="Designed" value={counts.designed} accent="info" />
        <SummaryCard label="Not started" value={counts.notStarted} accent="muted" />
        <SummaryCard label="Total" value={counts.total} accent="brand" />
      </div>

      {/* Screens grouped by persona */}
      <div className="space-y-8">
        {PERSONA_GROUPS.map((group) => {
          const groupScreens = SCREENS.filter((s) => s.audience === group.audience);
          if (groupScreens.length === 0) return null;
          return (
            <section key={group.audience}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 inline-flex items-center gap-2 mb-3">
                {group.icon}
                {group.label}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupScreens.map((screen) => (
                  <ScreenCard key={screen.name} screen={screen} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'success' | 'info' | 'muted' | 'brand';
}) {
  const tones = {
    success: 'bg-success/10 text-success',
    info: 'bg-status-info/10 text-status-info',
    muted: 'bg-gray-100 text-gray-500',
    brand: 'bg-brand-blue/10 text-brand-blue',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={cn('inline-block px-2 py-0.5 rounded-md text-2xl font-bold tabular-nums mt-1', tones[accent])}>
        {value}
      </p>
    </div>
  );
}

function ScreenCard({ screen }: { screen: Screen }) {
  const statusConfig = {
    implemented: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: 'Implemented',
      tone: 'bg-success/10 text-success',
    },
    designed: {
      icon: <Construction className="h-3.5 w-3.5" />,
      label: 'Designed',
      tone: 'bg-status-info/10 text-status-info',
    },
    'not-started': {
      icon: <CircleDashed className="h-3.5 w-3.5" />,
      label: 'Not started',
      tone: 'bg-gray-100 text-gray-500',
    },
  } as const;
  const config = statusConfig[screen.status];

  const audienceIcon: Record<Screen['audience'], React.ReactNode> = {
    Retailer: <ShoppingBag className="h-3.5 w-3.5" />,
    Wholesaler: <Building2 className="h-3.5 w-3.5" />,
    Warehouse: <Package className="h-3.5 w-3.5" />,
    Admin: <Shield className="h-3.5 w-3.5" />,
    Shared: <Bell className="h-3.5 w-3.5" />,
  };

  const screenIcon: Record<string, React.ReactNode> = {
    'Notification preferences': <Bell className="h-5 w-5" />,
    'Buyer verification': <Shield className="h-5 w-5" />,
    'Multi-location ship-to': <MapPin className="h-5 w-5" />,
    'Catalog CSV import': <FileSpreadsheet className="h-5 w-5" />,
    'Tier pricing editor': <DollarSign className="h-5 w-5" />,
    'Mobile barcode scanner': <ScanBarcode className="h-5 w-5" />,
    'Admin verification queue': <Shield className="h-5 w-5" />,
    'Auth screens': <Bell className="h-5 w-5" />,
  };

  const isLinkable = screen.status === 'implemented' && !screen.route.includes('[');

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
          {screenIcon[screen.name] ?? <CheckCircle2 className="h-5 w-5" />}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full',
            config.tone,
          )}
        >
          {config.icon}
          {config.label}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold text-dark">{screen.name}</h3>
      <p className="mt-1 text-xs text-gray-500 leading-relaxed">{screen.description}</p>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          {audienceIcon[screen.audience]}
          {screen.audience}
        </span>
        <span className="text-gray-300">·</span>
        <code className="font-mono text-gray-600 truncate">{screen.route}</code>
      </div>
      {isLinkable && (
        <Link
          href={screen.route}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-brand-blue-dark"
        >
          Open live →
        </Link>
      )}
    </div>
  );
}
