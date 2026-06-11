'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileCheck2,
  FileWarning,
  Upload,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';

type DocStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface BuyerDoc {
  id: string;
  type: 'RESALE_CERTIFICATE' | 'EIN_LETTER' | 'TOBACCO_LICENSE' | 'STATE_BUSINESS_LICENSE' | 'OTHER';
  fileName: string;
  status: DocStatus;
  rejectReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

interface VerificationStatus {
  status: 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  documents: BuyerDoc[];
  required: ReadonlyArray<BuyerDoc['type']>;
}

const REQUIRED_DOCS: ReadonlyArray<{ type: BuyerDoc['type']; label: string; description: string }> = [
  {
    type: 'RESALE_CERTIFICATE',
    label: 'Resale certificate',
    description: 'State-issued certificate proving you collect sales tax for resale.',
  },
  {
    type: 'EIN_LETTER',
    label: 'EIN letter (IRS CP-575)',
    description: 'IRS letter confirming your business Tax ID.',
  },
  {
    type: 'TOBACCO_LICENSE',
    label: 'State tobacco license',
    description: 'Required to ship tobacco / vape SKUs to your state.',
  },
];

export function BuyerVerificationView() {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/buyer/verification-status');
      if (!res.ok) throw new Error('Could not load verification status.');
      const body = (await res.json()) as VerificationStatus;
      setStatus(body);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-3 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading verification status…
      </div>
    );
  }

  if (error) return <ErrorBanner title="Couldn't load verification" message={error} />;
  if (!status) return null;

  return (
    <div className="space-y-6">
      <StatusBanner status={status.status} />
      <div className="space-y-3">
        {REQUIRED_DOCS.map((doc) => {
          const submitted = status.documents.find((d) => d.type === doc.type);
          return (
            <DocRow
              key={doc.type}
              required={doc}
              submitted={submitted}
              onUploaded={load}
              onError={setError}
            />
          );
        })}
      </div>
    </div>
  );
}

function StatusBanner({ status }: { status: VerificationStatus['status'] }) {
  const config = {
    UNVERIFIED: {
      icon: <FileWarning className="h-5 w-5" />,
      title: 'Not yet verified',
      message: 'Upload all three documents to unlock age-restricted SKUs.',
      tone: 'bg-status-warning/10 border-status-warning/30 text-dark',
      iconTone: 'text-status-warning',
    },
    PENDING_REVIEW: {
      icon: <Clock className="h-5 w-5" />,
      title: 'In review',
      message: 'Your documents are being reviewed. Most decisions land within 24 hours.',
      tone: 'bg-status-info/10 border-status-info/30 text-dark',
      iconTone: 'text-status-info',
    },
    VERIFIED: {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Verified',
      message: 'You can purchase age-restricted SKUs. Your verification is on file.',
      tone: 'bg-success/10 border-success/30 text-dark',
      iconTone: 'text-success',
    },
    REJECTED: {
      icon: <ShieldAlert className="h-5 w-5" />,
      title: 'Verification rejected',
      message: 'See per-document notes below. Re-upload to resubmit.',
      tone: 'bg-status-error/10 border-status-error/30 text-dark',
      iconTone: 'text-status-error',
    },
  } as const;
  const c = config[status];
  return (
    <div className={cn('rounded-xl border px-4 py-4 flex items-start gap-3', c.tone)}>
      <span className={cn('flex-shrink-0', c.iconTone)}>{c.icon}</span>
      <div>
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="text-sm text-gray-600 mt-0.5">{c.message}</p>
      </div>
    </div>
  );
}

function DocRow({
  required,
  submitted,
  onUploaded,
  onError,
}: {
  required: { type: BuyerDoc['type']; label: string; description: string };
  submitted?: BuyerDoc;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const status = submitted?.status;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const onFilePicked = async (file: File) => {
    onError(null);
    if (file.size > 10 * 1024 * 1024) {
      onError(`${file.name} is over the 10 MB limit.`);
      return;
    }
    setUploading(true);
    try {
      // Metadata-first flow: the review pipeline is live; signed-URL blob
      // upload is the wired-next step (see /api/buyer/documents).
      const res = await fetch('/api/buyer/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: required.type,
          fileName: file.name,
          fileSizeBytes: file.size,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Upload failed.');
      }
      await onUploaded();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
          status === 'APPROVED'
            ? 'bg-success/10 text-success'
            : status === 'REJECTED'
            ? 'bg-status-error/10 text-status-error'
            : status === 'PENDING'
            ? 'bg-status-info/10 text-status-info'
            : 'bg-gray-100 text-gray-400',
        )}
      >
        {status === 'APPROVED' ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : status === 'REJECTED' ? (
          <XCircle className="h-5 w-5" />
        ) : status === 'PENDING' ? (
          <Clock className="h-5 w-5" />
        ) : (
          <FileCheck2 className="h-5 w-5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-dark">{required.label}</p>
          <DocStatusBadge status={status} />
        </div>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{required.description}</p>
        {submitted && (
          <p className="text-xs text-gray-400 mt-1.5 font-mono truncate">{submitted.fileName}</p>
        )}
        {status === 'REJECTED' && submitted?.rejectReason && (
          <p className="text-xs text-status-error mt-1.5 leading-relaxed">
            <span className="font-semibold">Rejection reason:</span> {submitted.rejectReason}
          </p>
        )}
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFilePicked(file);
            }}
          />
          <Button
            type="button"
            variant={status === 'APPROVED' ? 'ghost' : 'secondary'}
            size="sm"
            leftIcon={
              uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )
            }
            onClick={() => fileInputRef.current?.click()}
            disabled={status === 'PENDING' || uploading}
          >
            {uploading
              ? 'Uploading…'
              : status === 'APPROVED'
              ? 'Replace'
              : status === 'PENDING'
              ? 'In review'
              : status === 'REJECTED'
              ? 'Re-upload'
              : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DocStatusBadge({ status }: { status?: DocStatus }) {
  if (!status) return <span className="text-[10px] uppercase tracking-wider text-gray-400">Required</span>;
  const map: Record<DocStatus, { label: string; tone: string }> = {
    APPROVED: { label: 'Approved', tone: 'bg-success/10 text-success' },
    PENDING: { label: 'In review', tone: 'bg-status-info/10 text-status-info' },
    REJECTED: { label: 'Rejected', tone: 'bg-status-error/10 text-status-error' },
  };
  const c = map[status];
  return (
    <span
      className={cn('text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', c.tone)}
    >
      {c.label}
    </span>
  );
}
