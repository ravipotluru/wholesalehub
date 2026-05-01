'use client';

import { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  FolderOpen,
  FileDown,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  X,
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  Loader2,
  Info,
  CheckCircle2,
  ExternalLink,
  Download,
  Copy,
  DollarSign,
  XCircle,
  FolderX,
  ImageOff,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done';

interface PreviewRow {
  rowNum: number;
  name: string;
  sku: string;
  brand: string;
  category: string;
  price: string;
  stock: number;
  moq: number;
  status: 'valid' | 'warning' | 'error';
  errorMessage?: string;
}

interface MappingRow {
  csvCol: string;
  sample: string;
  target: string;
  status: 'required' | 'mapped' | 'unmapped' | 'skipped';
}

const SAMPLE_MAPPING: MappingRow[] = [
  { csvCol: 'name', sample: '"Raz TN9000…"', target: 'Product name', status: 'required' },
  { csvCol: 'sku', sample: '"RZ-TN9-WMI"', target: 'SKU', status: 'required' },
  { csvCol: 'upc', sample: '"850001234567"', target: 'UPC / EAN', status: 'mapped' },
  { csvCol: 'brand', sample: '"Raz"', target: 'Brand', status: 'mapped' },
  { csvCol: 'category', sample: '"Disposables"', target: 'Category', status: 'mapped' },
  { csvCol: 'wholesale_price', sample: '"$12.50"', target: 'Unit price', status: 'required' },
  { csvCol: 'case_qty', sample: '"24"', target: 'Units per case', status: 'mapped' },
  { csvCol: 'moq', sample: '"6"', target: 'Min order qty', status: 'mapped' },
  { csvCol: 'stock', sample: '"144"', target: 'Stock on hand', status: 'mapped' },
  { csvCol: 'desc', sample: '"Disposable vape, 9000 puffs…"', target: 'Description', status: 'mapped' },
  { csvCol: 'img_url', sample: '"https://cdn…/raz-wmi.jpg"', target: 'Image URL', status: 'mapped' },
  { csvCol: 'age_restricted', sample: '"yes"', target: 'Age-restricted', status: 'mapped' },
  { csvCol: 'tax_class', sample: '"TOBACCO"', target: 'Choose field…', status: 'unmapped' },
  { csvCol: 'internal_notes', sample: '"Q2 promo eligible"', target: '— Skip column —', status: 'skipped' },
];

const SAMPLE_ERRORS: PreviewRow[] = [
  {
    rowNum: 14,
    name: 'Raz TN9000 · Watermelon Ice',
    sku: 'RZ-TN9-WMI',
    brand: 'Raz',
    category: 'Disposables',
    price: '$12.50',
    stock: 144,
    moq: 6,
    status: 'error',
    errorMessage: 'Duplicate SKU — already exists in your catalog',
  },
  {
    rowNum: 87,
    name: 'Lost Mary OS5000 · Blue Razz',
    sku: 'LM-OS5-BR',
    brand: 'Lost Mary',
    category: 'Disposables',
    price: '-$5.00',
    stock: 96,
    moq: 4,
    status: 'error',
    errorMessage: 'Price must be a positive number',
  },
  {
    rowNum: 142,
    name: 'Geek Bar Pulse Sour Apple',
    sku: '',
    brand: 'Geek Bar',
    category: 'Disposables',
    price: '$11.00',
    stock: 72,
    moq: 6,
    status: 'error',
    errorMessage: 'Required field missing: SKU',
  },
  {
    rowNum: 203,
    name: 'Elf Bar BC5000 · Strawberry Mango',
    sku: 'EB-BC5-SM',
    brand: 'Elf Bar',
    category: 'Vapes',
    price: '$10.25',
    stock: 120,
    moq: 6,
    status: 'error',
    errorMessage: 'Category "Vapes" not in your taxonomy. Choose existing or add new.',
  },
  {
    rowNum: 317,
    name: 'Funky Republic Ti7000 · Peach Mango',
    sku: 'FR-TI7-PM',
    brand: 'Funky Republic',
    category: 'Disposables',
    price: '$13.75',
    stock: 48,
    moq: 6,
    status: 'error',
    errorMessage: 'Image URL is unreachable (404)',
  },
];

export function CsvImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file (UTF-8, headers in row 1).');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('File too large. Max 50 MB / ~50,000 rows.');
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  const onContinueFromUpload = () => {
    if (!file) return;
    setStep('map');
  };

  const onCommit = () => {
    setStep('importing');
    // Simulated progress — real impl would POST to /api/products/import and poll job status.
    setImportProgress(0);
    const interval = setInterval(() => {
      setImportProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setStep('done');
          return 100;
        }
        return p + 4;
      });
    }, 80);
  };

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {error && <ErrorBanner title="Upload failed" message={error} />}

      {step === 'upload' && (
        <UploadStep
          file={file}
          dragOver={dragOver}
          onDrop={(f) => {
            setDragOver(false);
            if (f) handleFile(f);
          }}
          onDragOver={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onPick={() => fileInputRef.current?.click()}
          onClear={() => setFile(null)}
          fileInputRef={fileInputRef}
          onFileChange={handleFile}
          onContinue={onContinueFromUpload}
        />
      )}

      {step === 'map' && (
        <MapStep
          file={file}
          onBack={() => setStep('upload')}
          onContinue={() => setStep('preview')}
        />
      )}

      {step === 'preview' && (
        <PreviewStep
          onBack={() => setStep('map')}
          onCommit={onCommit}
        />
      )}

      {step === 'importing' && <ImportingStep progress={importProgress} />}

      {step === 'done' && <DoneStep onReset={() => {
        setStep('upload');
        setFile(null);
        setImportProgress(0);
      }} />}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'map', label: 'Map columns' },
    { id: 'preview', label: 'Preview & fix' },
    { id: 'done', label: 'Commit' },
  ];

  const currentIdx = (() => {
    if (step === 'importing' || step === 'done') return 3;
    return steps.findIndex((s) => s.id === step);
  })();

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3.5 flex items-center max-w-3xl mx-auto">
      {steps.map((s, idx) => {
        const isCurrent = idx === currentIdx;
        const isDone = idx < currentIdx;
        return (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold font-mono flex-shrink-0',
                  isDone && 'bg-success text-white',
                  isCurrent && 'bg-brand-blue text-white',
                  !isDone && !isCurrent && 'bg-gray-200 text-gray-500',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span
                className={cn(
                  'text-sm whitespace-nowrap',
                  isCurrent && 'text-brand-blue font-semibold',
                  isDone && 'text-dark',
                  !isDone && !isCurrent && 'text-gray-500',
                )}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-3 min-w-6',
                  isDone ? 'bg-success' : 'bg-gray-200',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({
  file,
  dragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onPick,
  onClear,
  fileInputRef,
  onFileChange,
  onContinue,
}: {
  file: File | null;
  dragOver: boolean;
  onDrop: (f: File | null) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onPick: () => void;
  onClear: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (f: File) => void;
  onContinue: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileChange(f);
        }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver();
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0] ?? null;
          onDrop(f);
        }}
        className={cn(
          'border-2 border-dashed rounded-2xl bg-white p-12 text-center transition-all',
          dragOver
            ? 'border-brand-blue bg-brand-blue/[0.03]'
            : 'border-gray-300 hover:border-brand-blue/50',
        )}
      >
        <div className="w-16 h-16 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center mx-auto mb-3.5">
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="text-base font-semibold text-dark">Drop your catalog CSV here</p>
        <p className="text-xs text-gray-500 mt-1">Up to 50,000 rows · UTF-8 · headers in row 1</p>
        <div className="my-4 inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 before:content-[''] before:w-10 before:h-px before:bg-gray-200 after:content-[''] after:w-10 after:h-px after:bg-gray-200">
          <span>or</span>
        </div>
        <div>
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={<FolderOpen className="h-3.5 w-3.5" />}
            onClick={onPick}
          >
            Browse files
          </Button>
        </div>
      </div>

      {file && (
        <div className="mt-4 flex items-center gap-3 bg-brand-blue/[0.04] border border-brand-blue/20 rounded-lg px-4 py-3.5">
          <div className="w-9 h-9 rounded-lg bg-white text-brand-blue flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{file.name}</p>
            <p className="text-[11px] font-mono text-gray-500 mt-0.5">
              {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-gray-500 hover:text-status-error p-1"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-6">
        <HelperCard
          icon={<FileDown className="h-4 w-4" />}
          tone="teal"
          title="Start from a template"
          description="Download our CSV template with all 14 fields, sample rows, and required-column markers."
          linkLabel="Download wholesalehub-catalog-template.csv"
          href="/api/products/import/template"
        />
        <HelperCard
          icon={<BookOpen className="h-4 w-4" />}
          tone="blue"
          title="Importing from another platform?"
          description="We auto-detect column layouts from Shopify, Faire, Joor, Square, and most ERPs. Just drop the export."
          linkLabel="View supported sources"
          href="#supported-sources"
        />
      </div>

      <WizardFoot
        leftText={file ? `${file.name} selected` : 'No file selected'}
        actions={
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!file}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            onClick={onContinue}
          >
            Continue
          </Button>
        }
      />
    </div>
  );
}

function MapStep({
  file,
  onBack,
  onContinue,
}: {
  file: File | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const unmapped = SAMPLE_MAPPING.filter((m) => m.status === 'unmapped').length;

  return (
    <div className="max-w-3xl mx-auto">
      {file && (
        <div className="flex items-center gap-3 bg-brand-blue/[0.04] border border-brand-blue/20 rounded-lg px-4 py-3.5 mb-4">
          <div className="w-9 h-9 rounded-lg bg-white text-brand-blue flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{file.name}</p>
            <p className="text-[11px] font-mono text-gray-500 mt-0.5">
              428 rows · 14 columns · {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button type="button" className="text-xs text-brand-teal hover:text-brand-teal-dark font-medium">
            Replace file
          </button>
        </div>
      )}

      <p className="text-sm text-gray-500 mb-4">
        We auto-matched 12 of 14 columns. Review and fix anything that&apos;s not quite right.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_30px_1fr_100px] gap-3.5 bg-gray-50 px-5 py-3 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          <div>CSV column</div>
          <div></div>
          <div>WholesaleHub field</div>
          <div>Status</div>
        </div>
        {SAMPLE_MAPPING.map((m) => (
          <div
            key={m.csvCol}
            className="grid grid-cols-[1fr_30px_1fr_100px] gap-3.5 px-5 py-3 border-b border-gray-100 last:border-0 items-center"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                {m.csvCol}
              </span>
              <span className="text-xs text-gray-500 font-mono truncate">{m.sample}</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
            <div
              className={cn(
                'border rounded-lg px-2.5 py-2 text-xs flex items-center justify-between',
                m.status === 'required' && 'border-success bg-success/[0.05]',
                m.status === 'mapped' && 'border-brand-blue/30 bg-brand-blue/[0.03]',
                m.status === 'unmapped' && 'border-dashed border-gray-300 text-gray-400',
                m.status === 'skipped' && 'border-gray-200 text-gray-400',
              )}
            >
              {m.target}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </div>
            <MapStatusBadge status={m.status} />
          </div>
        ))}
      </div>

      {unmapped > 0 && (
        <div className="mt-3 flex items-start gap-2.5 bg-status-info/[0.08] border border-status-info/20 rounded-lg px-4 py-3 text-sm">
          <Info className="h-4 w-4 text-status-info flex-shrink-0 mt-0.5" />
          <p className="text-dark">
            {unmapped} column unmapped. You can map it now or finish without it. Skipped columns
            are never written to your catalog.
          </p>
        </div>
      )}

      <WizardFoot
        leftText={
          <>
            <strong className="text-dark">{file?.name ?? 'file.csv'}</strong>
            <span className="text-gray-500"> · 428 rows ready to preview</span>
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="md"
              leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={onBack}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
              onClick={onContinue}
            >
              Preview rows
            </Button>
          </>
        }
      />
    </div>
  );
}

function PreviewStep({ onBack, onCommit }: { onBack: () => void; onCommit: () => void }) {
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings' | 'valid'>('errors');

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-sm text-gray-500 mb-4">
        Fix what you can inline. We&apos;ll skip rows that still have errors when you commit —
        they&apos;ll appear in the result report.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <SummaryStat label="Valid" value={412} sub="will be created" tone="success" />
        <SummaryStat label="Warnings" value={11} sub="imports w/ caveats" tone="warning" />
        <SummaryStat label="Errors" value={5} sub="need fix or will skip" tone="error" />
        <SummaryStat label="Total rows" value={428} sub="in CSV" />
      </div>

      <div className="flex gap-1.5 mb-3 items-center flex-wrap">
        <FilterPill label="All" count={428} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterPill label="Errors" count={5} active={filter === 'errors'} onClick={() => setFilter('errors')} />
        <FilterPill label="Warnings" count={11} active={filter === 'warnings'} onClick={() => setFilter('warnings')} />
        <FilterPill label="Valid" count={412} active={filter === 'valid'} onClick={() => setFilter('valid')} />
        <span className="ml-auto text-xs text-gray-500">
          Showing 5 of 428 · grouped by issue
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="text-left px-3 py-2.5 w-10">#</th>
              <th className="text-left px-3 py-2.5">Name</th>
              <th className="text-left px-3 py-2.5">SKU</th>
              <th className="text-left px-3 py-2.5">Brand</th>
              <th className="text-left px-3 py-2.5">Category</th>
              <th className="text-left px-3 py-2.5">Price</th>
              <th className="text-left px-3 py-2.5">Stock</th>
              <th className="text-left px-3 py-2.5">MOQ</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ERRORS.map((row) => (
              <tr key={row.rowNum} className="bg-status-error/[0.04] border-t border-gray-100">
                <td className="px-3 py-3 align-top">
                  <span className="font-mono text-[11px] text-gray-400">{row.rowNum}</span>
                </td>
                <td className="px-3 py-3 align-top">
                  <p className="text-sm">{row.name}</p>
                  <p className="flex items-start gap-1.5 mt-1 text-xs text-status-error font-medium">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>{row.errorMessage}</span>
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  {row.sku ? (
                    <span className="font-mono text-xs text-gray-700">{row.sku}</span>
                  ) : (
                    <input
                      placeholder="Enter SKU…"
                      className="w-full px-2 py-1 border border-status-error rounded text-xs font-mono"
                    />
                  )}
                </td>
                <td className="px-3 py-3 align-top text-sm">{row.brand}</td>
                <td className="px-3 py-3 align-top text-sm">
                  {row.category === 'Vapes' ? (
                    <input
                      defaultValue={row.category}
                      className="w-full px-2 py-1 border border-status-error rounded text-xs"
                    />
                  ) : (
                    row.category
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  {row.price.startsWith('-') ? (
                    <input
                      defaultValue={row.price}
                      className="w-full px-2 py-1 border border-status-error rounded text-xs font-mono text-status-error"
                    />
                  ) : (
                    <span className="font-mono font-semibold">{row.price}</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top text-sm font-mono">{row.stock}</td>
                <td className="px-3 py-3 align-top text-sm font-mono">{row.moq}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        <Lightbulb className="h-3.5 w-3.5 text-status-warning" />
        Tip: fix errors here to maximize your import. Anything still red when you commit will be
        reported and skipped.
      </p>

      <WizardFoot
        leftText={
          <>
            <strong className="text-success">412 valid</strong>
            <span className="text-gray-500"> · </span>
            <strong className="text-status-warning">11 warnings</strong>
            <span className="text-gray-500"> · </span>
            <strong className="text-status-error">5 errors</strong>
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="md"
              leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={onBack}
            >
              Back to mapping
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              rightIcon={<Check className="h-3.5 w-3.5" />}
              onClick={onCommit}
            >
              Commit 412 valid
            </Button>
          </>
        }
      />
    </div>
  );
}

function ImportingStep({ progress }: { progress: number }) {
  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-sm text-gray-500 mb-4">
        Hang tight — this typically takes about 1 minute per 1,000 rows. You can navigate away
        and we&apos;ll keep going.
      </p>
      <div className="flex items-center gap-3.5 bg-white border border-brand-blue/30 rounded-xl px-5 py-4 mb-5">
        <Loader2 className="h-7 w-7 text-brand-blue animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            Creating products · {Math.round((progress / 100) * 412)} of 412 done
          </p>
          <p className="text-[11px] font-mono text-gray-500 mt-0.5">
            Writing image URLs · validating UPCs · Job ID #imp_4f8a3b
          </p>
        </div>
        <span className="font-mono text-lg font-bold text-brand-blue">{progress}%</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 text-sm font-semibold">Activity</div>
        <ul className="py-1.5">
          <ActivityRow status="done" label="Validating row schema" timing="12s" />
          <ActivityRow status="done" label="Resolving categories & brands" timing="4s" />
          <ActivityRow status="active" label="Creating products & price tiers" timing="in progress" />
          <ActivityRow status="queued" label="Generating embeddings for search" timing="queued" />
          <ActivityRow status="queued" label="Indexing for autocomplete" timing="queued" />
        </ul>
      </div>
    </div>
  );
}

function DoneStep({ onReset }: { onReset: () => void }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl p-9 text-center mb-4">
        <div className="w-20 h-20 rounded-full bg-success/[0.12] text-success flex items-center justify-center mx-auto mb-4">
          <Check className="h-9 w-9" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Import complete</h2>
        <p className="text-sm text-gray-500 mt-1.5">
          412 of 417 products are live in your catalog. 5 rows were skipped — see below.
        </p>
        <div className="grid grid-cols-3 gap-3.5 mt-6 max-w-md mx-auto">
          <ResultStat label="Created" value={412} tone="success" />
          <ResultStat label="With warnings" value={11} tone="warning" />
          <ResultStat label="Skipped" value={5} tone="error" />
        </div>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => (window.location.href = '/products')}
          >
            View 412 new products
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            leftIcon={<UploadCloud className="h-3.5 w-3.5" />}
            onClick={onReset}
          >
            Import another file
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            leftIcon={<Download className="h-3.5 w-3.5" />}
          >
            Download import receipt
          </Button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-status-warning" />
          <p className="text-sm font-semibold">5 rows skipped</p>
          <button className="ml-auto text-xs text-brand-teal hover:text-brand-teal-dark font-medium">
            Download error CSV
          </button>
        </div>
        {SAMPLE_ERRORS.map((row) => {
          const reasons: Record<number, { icon: React.ReactNode; text: string }> = {
            14: { icon: <Copy className="h-3.5 w-3.5" />, text: 'Duplicate SKU' },
            87: { icon: <DollarSign className="h-3.5 w-3.5" />, text: 'Invalid price' },
            142: { icon: <XCircle className="h-3.5 w-3.5" />, text: 'Missing SKU' },
            203: { icon: <FolderX className="h-3.5 w-3.5" />, text: 'Unknown category' },
            317: { icon: <ImageOff className="h-3.5 w-3.5" />, text: 'Image 404' },
          };
          const r = reasons[row.rowNum] ?? { icon: <X className="h-3.5 w-3.5" />, text: 'Error' };
          return (
            <div key={row.rowNum} className="flex items-center gap-3.5 px-5 py-3 border-b border-gray-100 last:border-0 text-sm">
              <span className="font-mono text-[11px] text-gray-400 w-12">Row {row.rowNum}</span>
              <span className="flex-1 truncate">{row.name}</span>
              <span className="text-xs text-status-warning inline-flex items-center gap-1.5">
                {r.icon}
                {r.text}
              </span>
            </div>
          );
        })}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-2 text-sm text-gray-500">
          <Lightbulb className="h-3.5 w-3.5 text-status-warning" />
          Fix these in your CSV and re-upload — we&apos;ll only import the missing rows.
        </div>
      </div>
    </div>
  );
}

function HelperCard({
  icon,
  tone,
  title,
  description,
  linkLabel,
  href,
}: {
  icon: React.ReactNode;
  tone: 'teal' | 'blue';
  title: string;
  description: string;
  linkLabel: string;
  href: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            tone === 'teal' && 'bg-brand-teal/10 text-brand-teal',
            tone === 'blue' && 'bg-brand-blue/[0.08] text-brand-blue',
          )}
        >
          {icon}
        </div>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
      <a
        href={href}
        className="text-xs text-brand-teal hover:text-brand-teal-dark font-medium mt-2 inline-flex items-center gap-1"
      >
        {linkLabel} <ArrowRight className="h-3 w-3" />
      </a>
    </div>
  );
}

function MapStatusBadge({ status }: { status: MappingRow['status'] }) {
  const config = {
    required: { label: 'REQUIRED', tone: 'bg-success/10 text-success' },
    mapped: { label: 'MAPPED', tone: 'bg-brand-blue/10 text-brand-blue' },
    unmapped: { label: 'UNMAPPED', tone: 'bg-status-warning/10 text-status-warning' },
    skipped: { label: 'SKIPPED', tone: 'bg-gray-100 text-gray-700' },
  } as const;
  const c = config[status];
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap',
        c.tone,
      )}
    >
      {c.label}
    </span>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone?: 'success' | 'warning' | 'error';
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p
        className={cn(
          'font-mono text-2xl font-bold mt-0.5',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-status-warning',
          tone === 'error' && 'text-status-error',
          !tone && 'text-dark',
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'error';
}) {
  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50 py-3.5">
      <p
        className={cn(
          'font-mono text-2xl font-bold',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-status-warning',
          tone === 'error' && 'text-status-error',
        )}
      >
        {value}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mt-0.5">
        {label}
      </p>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
        active
          ? 'bg-brand-blue/10 text-brand-blue'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      )}
    >
      {label}
      <span
        className={cn(
          'font-mono text-[10px] font-bold px-1.5 rounded-full',
          active ? 'bg-brand-blue/15 text-brand-blue' : 'bg-black/[0.08] text-gray-700',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ActivityRow({
  status,
  label,
  timing,
}: {
  status: 'done' | 'active' | 'queued';
  label: string;
  timing: string;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 px-5 py-2.5 text-sm',
        status === 'active' && 'bg-brand-blue/[0.04] font-medium',
        status === 'queued' && 'text-gray-400',
      )}
    >
      {status === 'done' && <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />}
      {status === 'active' && (
        <Loader2 className="h-4 w-4 text-brand-blue animate-spin flex-shrink-0" />
      )}
      {status === 'queued' && (
        <span className="w-4 h-4 rounded-full border-2 border-gray-200 inline-block flex-shrink-0" />
      )}
      <span className="flex-1">{label}</span>
      <span
        className={cn(
          'font-mono text-[11px]',
          status === 'active' ? 'text-brand-blue' : 'text-gray-500',
        )}
      >
        {timing}
      </span>
    </li>
  );
}

function WizardFoot({
  leftText,
  actions,
}: {
  leftText: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="mt-6 px-5 py-3.5 bg-white border border-gray-200 rounded-xl flex items-center justify-between flex-wrap gap-3 shadow-sm">
      <div className="text-sm text-gray-500">{leftText}</div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}
