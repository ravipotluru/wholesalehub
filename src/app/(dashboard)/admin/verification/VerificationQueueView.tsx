'use client';

import { useState } from 'react';
import {
  Inbox,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Filter,
  MapPin,
  AlertCircle,
  Search,
  ChevronDown,
  MessageCircle,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Building,
  Truck,
  CreditCard,
  Users,
  Eye,
  Check,
  X,
  MessageSquare,
  Send,
  Phone,
  AlertOctagon,
  History,
  RotateCcw,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

interface QueueItem {
  id: string;
  initials: string;
  avatarBg: string;
  business: string;
  contact: string;
  city: string;
  ageMinutes: number;
  ein: string;
  tags: ReadonlyArray<{ label: string; tone: 'tobacco' | 'flag' | 'normal' | 'priority' | 'high' }>;
  urgency: 'high' | 'med' | 'low';
}

const SAMPLE_QUEUE: QueueItem[] = [
  {
    id: 'a1',
    initials: 'CT',
    avatarBg: '#1E4D8C',
    business: 'Cleveland Tobacco Co.',
    contact: 'Maya Reyes',
    city: 'Cleveland, OH',
    ageMinutes: 227,
    ein: '34-1827645',
    tags: [
      { label: 'TOBACCO', tone: 'tobacco' },
      { label: 'SLA RISK', tone: 'flag' },
    ],
    urgency: 'high',
  },
  {
    id: 'a2',
    initials: 'BS',
    avatarBg: '#7C3AED',
    business: 'Buckeye Smoke Distributors',
    contact: 'Jordan Patel',
    city: 'Akron, OH',
    ageMinutes: 134,
    ein: '82-3456789',
    tags: [
      { label: 'TOBACCO', tone: 'tobacco' },
      { label: 'RESALE', tone: 'normal' },
    ],
    urgency: 'med',
  },
  {
    id: 'a3',
    initials: 'VC',
    avatarBg: '#0891B2',
    business: 'Vape Central LLC',
    contact: 'Sam Chen',
    city: 'Columbus, OH',
    ageMinutes: 112,
    ein: '47-9876543',
    tags: [
      { label: 'TOBACCO', tone: 'tobacco' },
      { label: 'EIN', tone: 'normal' },
    ],
    urgency: 'low',
  },
  {
    id: 'a4',
    initials: 'RH',
    avatarBg: '#DC2626',
    business: 'River Hookah Co.',
    contact: 'Ali Hassan',
    city: 'Toledo, OH',
    ageMinutes: 63,
    ein: '52-1239876',
    tags: [
      { label: 'TOBACCO', tone: 'tobacco' },
      { label: 'RESUBMIT', tone: 'high' },
    ],
    urgency: 'low',
  },
  {
    id: 'a5',
    initials: 'SS',
    avatarBg: '#00B894',
    business: 'SmokeStack Distribution',
    contact: 'Riley Kim',
    city: 'Cincinnati, OH',
    ageMinutes: 42,
    ein: '63-5544321',
    tags: [
      { label: 'VIP REF', tone: 'priority' },
      { label: 'TOBACCO', tone: 'tobacco' },
    ],
    urgency: 'low',
  },
  {
    id: 'a6',
    initials: 'PV',
    avatarBg: '#7C2D12',
    business: 'Pine Valley Vapes',
    contact: 'Casey Brooks',
    city: 'Dayton, OH',
    ageMinutes: 28,
    ein: '71-1234567',
    tags: [
      { label: 'RESALE', tone: 'normal' },
      { label: 'EIN', tone: 'normal' },
    ],
    urgency: 'low',
  },
];

const REJECTION_REASONS = [
  'Tobacco license illegible',
  'EIN mismatch',
  'Resale cert expired',
  'Business not registered',
  'Suspected fraud',
  'Insufficient documentation',
  'Other',
];

function formatAge(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

export function VerificationQueueView({ reviewerHandle }: { reviewerHandle: string }) {
  const [tab, setTab] = useState<'pending' | 'awaiting' | 'approved' | 'rejected' | 'mine'>(
    'pending',
  );
  const [selectedId, setSelectedId] = useState<string>(SAMPLE_QUEUE[0].id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approvedItem, setApprovedItem] = useState<QueueItem | null>(null);

  const selected = SAMPLE_QUEUE.find((q) => q.id === selectedId) ?? SAMPLE_QUEUE[0];
  const next = SAMPLE_QUEUE.find((q) => q.id !== selectedId) ?? null;

  const onApprove = () => {
    setApprovedItem(selected);
    if (next) setSelectedId(next.id);
  };

  return (
    <div className="bg-[#FAFBFD] min-h-[100dvh] -mx-4 sm:-mx-6 -my-8 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 inline-flex items-center gap-1">
          <ArrowRight className="h-3 w-3 rotate-180" /> Console
        </span>
        <span className="text-gray-300">·</span>
        <h1 className="text-lg font-bold tracking-tight">Buyer verifications</h1>
        <div className="flex gap-1.5 ml-auto flex-wrap">
          <Pill tone="warn">12 awaiting</Pill>
          <Pill>avg. 3h 12m</Pill>
          <Pill>SLA 4h</Pill>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 px-6 flex gap-0 overflow-x-auto">
        {(
          [
            { id: 'pending', label: 'Pending', count: 12, icon: <Inbox className="h-3.5 w-3.5" /> },
            {
              id: 'awaiting',
              label: 'Awaiting buyer',
              count: 5,
              icon: <Clock className="h-3.5 w-3.5" />,
            },
            {
              id: 'approved',
              label: 'Approved today',
              count: 28,
              icon: <CheckCircle className="h-3.5 w-3.5" />,
            },
            {
              id: 'rejected',
              label: 'Rejected',
              count: 3,
              icon: <XCircle className="h-3.5 w-3.5" />,
            },
            { id: 'mine', label: 'Mine', count: 2, icon: <User className="h-3.5 w-3.5" /> },
          ] as const
        ).map((t, idx, arr) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-3 text-sm border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap transition-colors',
              tab === t.id
                ? 'text-brand-blue border-brand-blue font-semibold'
                : 'text-gray-500 border-transparent hover:text-dark',
              idx === arr.length - 1 && 'ml-auto',
            )}
          >
            {t.icon}
            {t.label}
            <span
              className={cn(
                'font-mono text-[11px] px-1.5 py-0.5 rounded-full',
                tab === t.id
                  ? 'bg-brand-blue text-white'
                  : 'bg-gray-100 text-gray-700',
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </nav>

      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2.5 flex-wrap">
        <FilterChip active label="Tobacco license" icon={<Filter className="h-3 w-3" />} />
        <FilterChip label="State: All" icon={<MapPin className="h-3 w-3" />} />
        <FilterChip label="Risk: All" icon={<AlertCircle className="h-3 w-3" />} />
        <div className="flex-1 max-w-xs relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            placeholder="Search business, EIN, agent…"
            className="w-full h-8 px-3 pl-9 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <span className="ml-auto text-xs text-gray-500 inline-flex items-center gap-1">
          Sort: <strong className="text-dark">Oldest</strong>
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </span>
      </div>

      {approvedItem && (
        <ApprovedBanner
          item={approvedItem}
          onUndo={() => setApprovedItem(null)}
          onDismiss={() => setApprovedItem(null)}
        />
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[380px_1fr] min-h-0">
        <aside className="bg-white border-r border-gray-200 overflow-y-auto max-h-[70vh] md:max-h-none">
          {SAMPLE_QUEUE.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
            />
          ))}
          <div className="px-4 py-4 text-center text-xs text-gray-500">
            6 more pending applications…
          </div>
        </aside>

        <main className="overflow-y-auto p-6">
          <DetailPane item={selected} />
        </main>
      </div>

      <footer className="bg-white border-t border-gray-200 px-6 py-3.5 sticky bottom-0 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">
          Reviewing as <strong className="text-dark">{reviewerHandle}</strong> · 14 reviewed today
          (avg. 4m 12s each)
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<MessageSquare className="h-3.5 w-3.5" />}
          >
            Request resubmit
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            leftIcon={<X className="h-3.5 w-3.5" />}
            onClick={() => setRejectOpen(true)}
          >
            Reject
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="!bg-success hover:!bg-success/90"
            leftIcon={<Check className="h-3.5 w-3.5" />}
            onClick={onApprove}
          >
            Approve & notify
          </Button>
        </div>
      </footer>

      {rejectOpen && (
        <RejectModal
          item={selected}
          onClose={() => setRejectOpen(false)}
          onSubmit={() => setRejectOpen(false)}
        />
      )}
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <span
      className={cn(
        'text-[11px] font-mono px-2.5 py-1 rounded-full',
        tone === 'warn'
          ? 'bg-status-warning/[0.12] text-status-warning'
          : 'bg-gray-100 text-gray-700',
      )}
    >
      {children}
    </span>
  );
}

function FilterChip({
  active,
  label,
  icon,
}: {
  active?: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors',
        active
          ? 'border-brand-blue text-brand-blue bg-brand-blue/[0.04]'
          : 'border-gray-200 text-gray-700 hover:border-gray-300',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function QueueRow({
  item,
  selected,
  onClick,
}: {
  item: QueueItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-5 py-3.5 border-b border-gray-100 flex gap-3 items-start transition-colors relative',
        selected ? 'bg-brand-blue/[0.05] border-l-[3px] border-l-brand-blue' : 'hover:bg-gray-50',
      )}
    >
      <span
        className={cn(
          'w-1 self-stretch rounded-sm flex-shrink-0',
          item.urgency === 'high' && 'bg-status-error',
          item.urgency === 'med' && 'bg-brand-orange',
          item.urgency === 'low' && 'bg-gray-300',
        )}
      />
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
        style={{ backgroundColor: item.avatarBg }}
      >
        {item.initials}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold truncate text-dark">{item.business}</span>
          <span className="text-[11px] text-gray-500 font-mono flex-shrink-0">
            {formatAge(item.ageMinutes)}
          </span>
        </span>
        <span className="block text-xs text-gray-500 truncate">
          {item.contact} · {item.city}
        </span>
        <span className="flex flex-wrap gap-1 mt-1.5">
          {item.tags.map((t) => (
            <Tag key={t.label} tone={t.tone}>
              {t.label}
            </Tag>
          ))}
        </span>
      </span>
    </button>
  );
}

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'tobacco' | 'flag' | 'normal' | 'priority' | 'high';
}) {
  const map = {
    tobacco: 'bg-brand-orange/[0.12] text-brand-orange',
    flag: 'bg-status-error/10 text-status-error',
    high: 'bg-status-error/10 text-status-error',
    normal: 'bg-gray-100 text-gray-700',
    priority: 'bg-success/10 text-success',
  } as const;
  return (
    <span
      className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold', map[tone])}
    >
      {children}
    </span>
  );
}

function DetailPane({ item }: { item: QueueItem }) {
  return (
    <div>
      <div className="flex gap-4 items-start pb-5 border-b border-gray-200 mb-5">
        <div
          className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-base font-bold flex-shrink-0"
          style={{ backgroundColor: item.avatarBg }}
        >
          {item.initials}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{item.business}</h2>
          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3.5">
            <span>
              <User className="h-3 w-3 inline -mt-0.5 mr-1" />
              {item.contact}
            </span>
            <span className="font-mono">EIN {item.ein}</span>
            <span>
              <MapPin className="h-3 w-3 inline -mt-0.5 mr-1" />
              {item.city}
            </span>
            <span>
              <Phone className="h-3 w-3 inline -mt-0.5 mr-1" />
              (216) 555-0182
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="bg-status-warning/10 text-status-warning text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">
              {formatAge(item.ageMinutes)} old · SLA risk
            </span>
            <span className="bg-brand-orange/10 text-brand-orange text-[10px] font-semibold px-2 py-0.5 rounded-full">
              TOBACCO LICENSE
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
          >
            Message buyer
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50"
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-gray-500" />
          </button>
        </div>
      </div>

      <SectionHeader title="Automated checks" count="7 of 8 passed" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Signal status="ok" label="EIN matches IRS records" value="34-1827645" />
        <Signal status="ok" label="Resale cert on Ohio DOT registry" value="VALID" />
        <Signal status="ok" label="Business address verified" value="USPS" />
        <Signal status="ok" label="Domain age > 2 years" value="7y" />
        <Signal status="warn" label="Tobacco license needs OCR review" value="MANUAL" />
        <Signal status="ok" label="Phone number verified" value="SMS OK" />
        <Signal status="ok" label="No prior bans on operator" value="CLEAN" />
        <Signal status="ok" label="Email domain not disposable" value="CORP" />
      </div>

      <SectionHeader title="Submitted documents" count="3 files · 4.2 MB" />
      <DocCard
        type="pdf"
        name="Resale_Cert_OH_2024.pdf"
        meta="1.2 MB · Ohio DOT-issued · Exp. 2026-12-31 · Auto-verified"
      />
      <DocCard
        type="img"
        name="Tobacco_license.jpg"
        flagged
        meta="2.1 MB · Photo · OCR confidence 71% · License# OH-T-2024-44829 · Exp. 2025-06-30"
      />
      <DocCard
        type="pdf"
        name="EIN_Letter_147C.pdf"
        meta="0.9 MB · IRS Form 147C · EIN matches application · Auto-verified"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-5">
        <DetailCard
          icon={<Building className="h-3 w-3" />}
          label="Business address"
          value={item.business}
          meta={`2841 W 25th St, ${item.city} 44113. Verified · matches DOT registry`}
        />
        <DetailCard
          icon={<Truck className="h-3 w-3" />}
          label="Ship-to addresses"
          value="3 locations"
          meta="2 retail storefronts + 1 warehouse · all in OH"
        />
        <DetailCard
          icon={<CreditCard className="h-3 w-3" />}
          label="Requested terms"
          value="Net-30, $25k limit"
          meta="Bank verified via Plaid · D&B score 78 (good)"
        />
        <DetailCard
          icon={<Users className="h-3 w-3" />}
          label="Referrals"
          value="2 sellers vouch"
          meta="Buckeye Wholesale (3y), Lake Erie Distributors (1y)"
        />
      </div>

      <SectionHeader title="Activity" />
      <ol className="relative pl-5 border-l-2 border-gray-200 space-y-3.5">
        <TimelineItem when="Now" what={<><strong>You</strong> opened this application</>} who="agent.kowalski" current />
        <TimelineItem when={`${formatAge(item.ageMinutes)} ago`} what="Application submitted with 3 documents" who={`${item.contact} · IP 76.x.x.142 (${item.city})`} />
        <TimelineItem when={`${formatAge(item.ageMinutes)} ago`} what="Auto-checks ran: 7/8 passed, OCR flagged tobacco license for manual review" who="system" />
        <TimelineItem when="2 days ago" what="Email verified" who={item.contact} />
        <TimelineItem when="2 days ago" what="Account created" who={item.contact} />
      </ol>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: string }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {count && <span className="text-xs text-gray-500 font-mono">{count}</span>}
    </div>
  );
}

function Signal({
  status,
  label,
  value,
}: {
  status: 'ok' | 'warn' | 'err';
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5 px-3 py-2.5 rounded-lg text-xs items-center',
        status === 'ok' && 'bg-success/[0.06]',
        status === 'warn' && 'bg-brand-orange/[0.08]',
        status === 'err' && 'bg-status-error/[0.08]',
      )}
    >
      {status === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 text-success flex-shrink-0" />}
      {status === 'warn' && <AlertTriangle className="h-3.5 w-3.5 text-brand-orange flex-shrink-0" />}
      {status === 'err' && <AlertOctagon className="h-3.5 w-3.5 text-status-error flex-shrink-0" />}
      <span className="flex-1 text-dark">{label}</span>
      <span className="font-mono text-[11px] font-semibold">{value}</span>
    </div>
  );
}

function DocCard({
  type,
  name,
  meta,
  flagged,
}: {
  type: 'pdf' | 'img';
  name: string;
  meta: string;
  flagged?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 items-center px-4 py-3 border rounded-lg mb-2',
        flagged
          ? 'bg-brand-orange/[0.03] border-brand-orange/40'
          : 'bg-white border-gray-200',
      )}
    >
      <div
        className={cn(
          'w-10 h-12 rounded-md flex items-center justify-center font-mono text-[9px] font-bold flex-shrink-0',
          type === 'pdf' && 'bg-status-error/10 text-status-error',
          type === 'img' && 'bg-brand-blue/[0.08] text-brand-blue',
        )}
      >
        {type.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">
          {name}
          {flagged && (
            <span className="ml-2 text-[10px] text-brand-orange font-bold">⚠ NEEDS REVIEW</span>
          )}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">{meta}</p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          type="button"
          className="px-2.5 py-1 border border-gray-200 rounded-md text-[11px] inline-flex items-center gap-1 hover:bg-gray-50"
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>
        <button
          type="button"
          className="px-2.5 py-1 border border-success/30 text-success rounded-md text-[11px] inline-flex items-center gap-1 hover:bg-success/[0.05]"
        >
          <Check className="h-3 w-3" />
          OK
        </button>
      </div>
    </div>
  );
}

function DetailCard({
  icon,
  label,
  value,
  meta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{meta}</p>
    </div>
  );
}

function TimelineItem({
  when,
  what,
  who,
  current,
}: {
  when: string;
  what: React.ReactNode;
  who: string;
  current?: boolean;
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[23px] top-1.5 w-2 h-2 rounded-full border-2 border-white',
          current ? 'bg-brand-blue' : 'bg-gray-300',
        )}
      />
      <div className="font-mono text-[10px] text-gray-500">{when}</div>
      <div className="text-xs text-dark mt-0.5">{what}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{who}</div>
    </li>
  );
}

function ApprovedBanner({
  item,
  onUndo,
  onDismiss,
}: {
  item: QueueItem;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-white border-y border-success/30 px-6 py-3.5 flex gap-4 items-center"
    >
      <div className="w-10 h-10 rounded-full bg-success text-white flex items-center justify-center flex-shrink-0">
        <Check className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{item.business} approved</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Net-30 with $25,000 limit · {item.contact} notified by email · 4m 12s review time
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onUndo}>
          Undo
        </Button>
        <Button type="button" variant="ghost" size="sm" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
          View buyer profile
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-dark p-1"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function RejectModal({
  item,
  onClose,
  onSubmit,
}: {
  item: QueueItem;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0]);
  const [severity, setSeverity] = useState<'soft' | 'hard' | 'permanent'>('soft');
  const [note, setNote] = useState(
    `The tobacco license photo you uploaded is too blurry — we can't read the license number or expiration date. Please re-shoot it in good lighting, on a flat surface, with no glare. PDF scans also work great.\n\nOnce you re-upload, we'll review again within 4 business hours.\n\n— Trust & Safety, WholesaleHub`,
  );
  const [notify, setNotify] = useState(true);

  return (
    <Modal isOpen onClose={onClose} title="Reject application" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          {item.contact} at <strong>{item.business}</strong> will receive an email with your reason
          and instructions to resubmit. They cannot place orders until re-approved.
        </p>

        <div>
          <label className="block text-xs font-semibold mb-1.5">Reason</label>
          <div className="flex flex-wrap gap-1.5">
            {REJECTION_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  'text-[11px] px-2.5 py-1 border rounded-full transition-colors',
                  reason === r
                    ? 'bg-status-error/[0.06] border-status-error/40 text-status-error font-medium'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as 'soft' | 'hard' | 'permanent')}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="soft">Soft — buyer can resubmit immediately</option>
            <option value="hard">Hard — buyer must contact support to retry</option>
            <option value="permanent">Permanent ban (requires manager sign-off)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5">
            Note to buyer (visible in their email)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-y font-sans"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="rounded text-brand-blue"
          />
          Send me a notification if they resubmit (so I can pick it up)
        </label>

        <div className="flex justify-end gap-2 pt-2 -mb-2 -mx-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            leftIcon={<Send className="h-3.5 w-3.5" />}
            onClick={onSubmit}
          >
            Reject &amp; email buyer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
