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

type FieldKey =
  | 'name'
  | 'sku'
  | 'upc'
  | 'brand'
  | 'category'
  | 'price'
  | 'caseQty'
  | 'moq'
  | 'stock'
  | 'description'
  | 'imageUrl'
  | 'ageRestricted';

const REQUIRED_FIELDS: FieldKey[] = ['name', 'sku', 'price'];

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Product name',
  sku: 'SKU',
  upc: 'UPC / EAN',
  brand: 'Brand',
  category: 'Category',
  price: 'Unit price',
  caseQty: 'Units per case',
  moq: 'Min order qty',
  stock: 'Stock on hand',
  description: 'Description',
  imageUrl: 'Image URL',
  ageRestricted: 'Age-restricted',
};

/** Normalized CSV header (lowercase, alphanumerics only) → wizard field. */
const HEADER_ALIASES: Record<string, FieldKey> = {
  name: 'name',
  productname: 'name',
  sku: 'sku',
  upc: 'upc',
  barcode: 'upc',
  brand: 'brand',
  category: 'category',
  price: 'price',
  wholesaleprice: 'price',
  cost: 'price',
  caseqty: 'caseQty',
  moq: 'moq',
  minorder: 'moq',
  minorderqty: 'moq',
  stock: 'stock',
  qty: 'stock',
  quantity: 'stock',
  desc: 'description',
  description: 'description',
  img: 'imageUrl',
  image: 'imageUrl',
  imageurl: 'imageUrl',
  agerestricted: 'ageRestricted',
};

/** Server contract: POST /api/products/import caps rows at 5,000. */
const MAX_ROWS = 5000;
const MAX_DISPLAY_ROWS = 50;
const MAX_INT = 2_147_483_647;
const PRICE_RE = /^\d{1,8}(\.\d{1,2})?$/;

interface CsvData {
  headers: string[];
  rows: string[][];
}

interface ColumnMapping {
  csvCol: string;
  sample: string;
  field: FieldKey | null;
}

/** Row shape sent to POST /api/products/import (mirrors the route's Zod). */
interface ApiRow {
  name: string;
  sku: string;
  upc?: string;
  brand?: string;
  category?: string;
  price: string;
  caseQty?: number;
  moq?: number;
  stock?: number;
  description?: string;
  imageUrl?: string;
  ageRestricted?: boolean;
}

interface SentRow {
  row: ApiRow;
  /** 1-based CSV line number (header is line 1). */
  csvRowNum: number;
}

interface RowIssue {
  csvRowNum: number;
  sku: string;
  reason: string;
}

/** Issue as returned by the API — rowIndex is the index in the sent array. */
interface ServerIssue {
  rowIndex: number;
  sku: string;
  reason: string;
}

interface DisplayRow {
  csvRowNum: number;
  name: string;
  sku: string;
  brand: string;
  category: string;
  price: string;
  stock: string;
  moq: string;
}

interface PreparedData {
  sent: SentRow[];
  clientErrors: RowIssue[];
  displayRows: DisplayRow[];
  totalRows: number;
}

interface PreviewData {
  errors: RowIssue[];
  warnings: RowIssue[];
}

interface CommitData {
  created: number;
  skipped: RowIssue[];
}

interface PreviewResponse {
  valid: number;
  errors: ServerIssue[];
  warnings: ServerIssue[];
}

interface CommitResponse {
  created: number;
  skipped: ServerIssue[];
}

/**
 * Minimal RFC-4180-ish CSV parser: quoted fields (embedded commas/newlines),
 * doubled-quote escapes, CRLF/LF/CR line endings. No dependencies.
 */
function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM if present (Excel exports have one).
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (c === '\r') {
      if (input[i + 1] !== '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      }
      // \r\n: swallow the \r, the \n branch closes the row
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function autoMapColumns(headers: string[], firstRow: string[] | undefined): ColumnMapping[] {
  const used = new Set<FieldKey>();
  return headers.map((h, i) => {
    const norm = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidate = HEADER_ALIASES[norm] as FieldKey | undefined;
    const field = candidate && !used.has(candidate) ? candidate : null;
    if (field) used.add(field);
    const sampleRaw = (firstRow?.[i] ?? '').trim();
    return {
      csvCol: h.trim() || `column_${i + 1}`,
      sample: sampleRaw ? `"${truncate(sampleRaw, 28)}"` : '',
      field,
    };
  });
}

/** undefined = column absent/blank, null = present but invalid. */
function parseIntField(value: string, min: number): number | null | undefined {
  if (!value) return undefined;
  if (!/^\d{1,10}$/.test(value)) return null;
  const n = parseInt(value, 10);
  if (n < min || n > MAX_INT) return null;
  return n;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Turn parsed CSV cells into API rows using the column mapping. Rows that
 * fail the shape rules (mirroring the route's Zod) become client-side
 * errors and are never sent — the server handles dupes/collisions/categories.
 */
function buildRows(csv: CsvData, mappings: ColumnMapping[]): PreparedData {
  const fieldIdx = new Map<FieldKey, number>();
  mappings.forEach((m, i) => {
    if (m.field && !fieldIdx.has(m.field)) fieldIdx.set(m.field, i);
  });
  const get = (cells: string[], f: FieldKey): string => {
    const idx = fieldIdx.get(f);
    return idx === undefined ? '' : (cells[idx] ?? '').trim();
  };

  const sent: SentRow[] = [];
  const clientErrors: RowIssue[] = [];
  const displayRows: DisplayRow[] = [];

  csv.rows.forEach((cells, i) => {
    const csvRowNum = i + 2; // 1-based, +1 for the header line
    const name = get(cells, 'name');
    const sku = get(cells, 'sku');
    const price = get(cells, 'price').replace(/[$,\s]/g, '');
    const upc = get(cells, 'upc');
    const brand = get(cells, 'brand');
    const category = get(cells, 'category');
    const description = get(cells, 'description');
    const imageUrl = get(cells, 'imageUrl');
    const ageRaw = get(cells, 'ageRestricted').toLowerCase();

    displayRows.push({
      csvRowNum,
      name: name || '—',
      sku,
      brand,
      category,
      price: get(cells, 'price'),
      stock: get(cells, 'stock'),
      moq: get(cells, 'moq'),
    });

    let reason: string | null = null;
    const setReason = (msg: string) => {
      if (!reason) reason = msg;
    };

    if (!name) setReason('Missing product name');
    else if (name.length > 200) setReason('Product name is longer than 200 characters');
    if (!sku) setReason('Missing SKU');
    else if (sku.length > 64) setReason('SKU is longer than 64 characters');
    if (!PRICE_RE.test(price)) setReason('Invalid price — use a positive amount like 12.50');
    if (upc.length > 32) setReason('UPC is longer than 32 characters');
    if (brand.length > 80) setReason('Brand is longer than 80 characters');
    if (category.length > 80) setReason('Category is longer than 80 characters');
    if (description.length > 2000) setReason('Description is longer than 2,000 characters');

    const row: ApiRow = { name, sku, price };
    if (upc) row.upc = upc;
    if (brand) row.brand = brand;
    if (category) row.category = category;
    if (description) row.description = description;

    const caseQty = parseIntField(get(cells, 'caseQty'), 1);
    if (caseQty === null) setReason('Invalid case quantity — use a whole number of 1 or more');
    else if (caseQty !== undefined) row.caseQty = caseQty;

    const moq = parseIntField(get(cells, 'moq'), 1);
    if (moq === null) setReason('Invalid minimum order quantity — use a whole number of 1 or more');
    else if (moq !== undefined) row.moq = moq;

    const stock = parseIntField(get(cells, 'stock'), 0);
    if (stock === null) setReason('Invalid stock quantity — use a whole number of 0 or more');
    else if (stock !== undefined) row.stock = stock;

    if (imageUrl) {
      if (isValidUrl(imageUrl)) row.imageUrl = imageUrl;
      else setReason('Invalid image URL');
    }

    if (ageRaw) {
      if (['yes', 'y', 'true', '1'].includes(ageRaw)) row.ageRestricted = true;
      else if (['no', 'n', 'false', '0'].includes(ageRaw)) row.ageRestricted = false;
      else setReason('Invalid age-restricted value — use yes or no');
    }

    if (reason) clientErrors.push({ csvRowNum, sku, reason });
    else sent.push({ row, csvRowNum });
  });

  return { sent, clientErrors, displayRows, totalRows: csv.rows.length };
}

async function postImport<T>(dryRun: boolean, rows: ApiRow[]): Promise<T> {
  const res = await fetch('/api/products/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun, rows }),
  });
  if (!res.ok) {
    let message = `Import request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CsvImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [csv, setCsv] = useState<CsvData | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [prepared, setPrepared] = useState<PreparedData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [commitResult, setCommitResult] = useState<CommitData | null>(null);

  const clearFile = () => {
    setFile(null);
    setCsv(null);
    setMappings([]);
    setPrepared(null);
    setPreview(null);
    setCommitResult(null);
  };

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file (UTF-8, headers in row 1).');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('File too large. Max 50 MB.');
      return;
    }
    f.text()
      .then((text) => {
        const parsed = parseCsv(text);
        if (parsed.length < 2) {
          setError('CSV needs a header row plus at least one data row.');
          return;
        }
        const [headers, ...rows] = parsed;
        if (rows.length > MAX_ROWS) {
          setError(`Too many rows — max ${MAX_ROWS.toLocaleString()} per import.`);
          return;
        }
        setError(null);
        setFile(f);
        setCsv({ headers, rows });
        setMappings(autoMapColumns(headers, rows[0]));
        setPrepared(null);
        setPreview(null);
        setCommitResult(null);
      })
      .catch(() => setError('Could not read the file. Is it a plain-text CSV?'));
  }, []);

  const onContinueFromUpload = () => {
    if (!file || !csv) return;
    setStep('map');
  };

  const runPreview = (p: PreparedData) => {
    setPreviewLoading(true);
    setError(null);
    const mapIssue = (issue: ServerIssue): RowIssue => ({
      csvRowNum: p.sent[issue.rowIndex]?.csvRowNum ?? -1,
      sku: issue.sku,
      reason: issue.reason,
    });
    postImport<PreviewResponse>(true, p.sent.map((s) => s.row))
      .then((res) => {
        setPreview({
          errors: res.errors.map(mapIssue),
          warnings: res.warnings.map(mapIssue),
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setPreviewLoading(false));
  };

  const onContinueFromMap = () => {
    if (!csv) return;
    const p = buildRows(csv, mappings);
    setPrepared(p);
    setPreview(null);
    setStep('preview');
    runPreview(p);
  };

  const combinedErrors: RowIssue[] = prepared
    ? [...prepared.clientErrors, ...(preview?.errors ?? [])]
    : [];
  const warnings: RowIssue[] = preview?.warnings ?? [];
  const totalRows = prepared?.totalRows ?? 0;
  const validCount = prepared && preview ? totalRows - combinedErrors.length : 0;

  const onCommit = () => {
    if (!prepared || !preview) return;
    setStep('importing');
    setError(null);
    const p = prepared;
    const mapIssue = (issue: ServerIssue): RowIssue => ({
      csvRowNum: p.sent[issue.rowIndex]?.csvRowNum ?? -1,
      sku: issue.sku,
      reason: issue.reason,
    });
    postImport<CommitResponse>(false, p.sent.map((s) => s.row))
      .then((res) => {
        setCommitResult({
          created: res.created,
          skipped: [...p.clientErrors, ...res.skipped.map(mapIssue)],
        });
        setStep('done');
      })
      .catch((e: Error) => {
        setError(e.message);
        setStep('preview');
      });
  };

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {error && <ErrorBanner title="Import problem" message={error} />}

      {step === 'upload' && (
        <UploadStep
          file={file}
          rowCount={csv?.rows.length ?? null}
          dragOver={dragOver}
          onDrop={(f) => {
            setDragOver(false);
            if (f) handleFile(f);
          }}
          onDragOver={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onPick={() => fileInputRef.current?.click()}
          onClear={clearFile}
          fileInputRef={fileInputRef}
          onFileChange={handleFile}
          onContinue={onContinueFromUpload}
        />
      )}

      {step === 'map' && csv && (
        <MapStep
          file={file}
          rowCount={csv.rows.length}
          colCount={csv.headers.length}
          mappings={mappings}
          onBack={() => setStep('upload')}
          onReplaceFile={() => {
            clearFile();
            setStep('upload');
          }}
          onContinue={onContinueFromMap}
        />
      )}

      {step === 'preview' && prepared && (
        <PreviewStep
          loading={previewLoading}
          ready={preview !== null}
          totalRows={totalRows}
          validCount={validCount}
          errors={combinedErrors}
          warnings={warnings}
          displayRows={prepared.displayRows}
          onBack={() => setStep('map')}
          onCommit={onCommit}
        />
      )}

      {step === 'importing' && <ImportingStep rowCount={prepared?.sent.length ?? 0} />}

      {step === 'done' && commitResult && (
        <DoneStep
          result={commitResult}
          warningsCount={warnings.length}
          totalRows={totalRows}
          displayRows={prepared?.displayRows ?? []}
          onReset={() => {
            clearFile();
            setStep('upload');
          }}
        />
      )}
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
  rowCount,
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
  rowCount: number | null;
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
        <p className="text-xs text-gray-500 mt-1">Up to 5,000 rows · UTF-8 · headers in row 1</p>
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
              {rowCount !== null && ` · ${rowCount.toLocaleString()} rows detected`}
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
          description="Download our CSV template with all 12 fields, sample rows, and required-column markers."
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
            disabled={!file || rowCount === null}
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
  rowCount,
  colCount,
  mappings,
  onBack,
  onReplaceFile,
  onContinue,
}: {
  file: File | null;
  rowCount: number;
  colCount: number;
  mappings: ColumnMapping[];
  onBack: () => void;
  onReplaceFile: () => void;
  onContinue: () => void;
}) {
  const mappedCount = mappings.filter((m) => m.field !== null).length;
  const skippedCount = mappings.length - mappedCount;
  const requiredMissing = REQUIRED_FIELDS.filter(
    (f) => !mappings.some((m) => m.field === f),
  );

  const statusFor = (m: ColumnMapping): 'required' | 'mapped' | 'skipped' => {
    if (m.field === null) return 'skipped';
    return REQUIRED_FIELDS.includes(m.field) ? 'required' : 'mapped';
  };

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
              {rowCount.toLocaleString()} rows · {colCount} columns · {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={onReplaceFile}
            className="text-xs text-brand-teal hover:text-brand-teal-dark font-medium"
          >
            Replace file
          </button>
        </div>
      )}

      <p className="text-sm text-gray-500 mb-4">
        We auto-matched {mappedCount} of {mappings.length} columns. Columns we couldn&apos;t
        match are skipped and never written to your catalog.
      </p>

      {requiredMissing.length > 0 && (
        <ErrorBanner
          className="mb-4"
          title="Missing required columns"
          message={`Your CSV needs a column for: ${requiredMissing
            .map((f) => FIELD_LABELS[f])
            .join(', ')}. Rename the headers in your file and re-upload.`}
        />
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_30px_1fr_100px] gap-3.5 bg-gray-50 px-5 py-3 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          <div>CSV column</div>
          <div></div>
          <div>WholesaleHub field</div>
          <div>Status</div>
        </div>
        {mappings.map((m, idx) => {
          const status = statusFor(m);
          return (
            <div
              key={`${m.csvCol}-${idx}`}
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
                  status === 'required' && 'border-success bg-success/[0.05]',
                  status === 'mapped' && 'border-brand-blue/30 bg-brand-blue/[0.03]',
                  status === 'skipped' && 'border-gray-200 text-gray-400',
                )}
              >
                {m.field ? FIELD_LABELS[m.field] : '— Skip column —'}
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </div>
              <MapStatusBadge status={status} />
            </div>
          );
        })}
      </div>

      {skippedCount > 0 && (
        <div className="mt-3 flex items-start gap-2.5 bg-status-info/[0.08] border border-status-info/20 rounded-lg px-4 py-3 text-sm">
          <Info className="h-4 w-4 text-status-info flex-shrink-0 mt-0.5" />
          <p className="text-dark">
            {skippedCount} column{skippedCount === 1 ? '' : 's'} didn&apos;t match a WholesaleHub
            field and will be skipped. Skipped columns are never written to your catalog.
          </p>
        </div>
      )}

      <WizardFoot
        leftText={
          <>
            <strong className="text-dark">{file?.name ?? 'file.csv'}</strong>
            <span className="text-gray-500">
              {' '}
              · {rowCount.toLocaleString()} rows ready to preview
            </span>
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
              disabled={requiredMissing.length > 0}
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

function PreviewStep({
  loading,
  ready,
  totalRows,
  validCount,
  errors,
  warnings,
  displayRows,
  onBack,
  onCommit,
}: {
  loading: boolean;
  ready: boolean;
  totalRows: number;
  validCount: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  displayRows: DisplayRow[];
  onBack: () => void;
  onCommit: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings' | 'valid'>('errors');

  const errorByRow = new Map(errors.map((e) => [e.csvRowNum, e.reason]));
  const warnByRow = new Map(warnings.map((w) => [w.csvRowNum, w.reason]));

  const rows = displayRows.map((r) => {
    const err = errorByRow.get(r.csvRowNum);
    const warn = warnByRow.get(r.csvRowNum);
    return {
      ...r,
      status: err ? ('error' as const) : warn ? ('warning' as const) : ('valid' as const),
      message: err ?? warn,
    };
  });
  const filtered =
    filter === 'all'
      ? rows
      : rows.filter((r) =>
          filter === 'errors'
            ? r.status === 'error'
            : filter === 'warnings'
              ? r.status === 'warning'
              : r.status === 'valid',
        );
  const shown = filtered.slice(0, MAX_DISPLAY_ROWS);

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-sm text-gray-500 mb-4">
        We validated every row against your catalog. Rows that still have errors when you
        commit are skipped and reported — fix them in your CSV and re-upload.
      </p>

      {loading && (
        <div className="flex items-center gap-3.5 bg-white border border-brand-blue/30 rounded-xl px-5 py-4">
          <Loader2 className="h-6 w-6 text-brand-blue animate-spin flex-shrink-0" />
          <p className="text-sm font-semibold">
            Validating {totalRows.toLocaleString()} rows against your catalog…
          </p>
        </div>
      )}

      {!loading && !ready && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 text-sm text-gray-500">
          Validation didn&apos;t complete. Go back to mapping and try again.
        </div>
      )}

      {!loading && ready && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <SummaryStat label="Valid" value={validCount} sub="will be created" tone="success" />
            <SummaryStat label="Warnings" value={warnings.length} sub="imports w/ caveats" tone="warning" />
            <SummaryStat label="Errors" value={errors.length} sub="need fix or will skip" tone="error" />
            <SummaryStat label="Total rows" value={totalRows} sub="in CSV" />
          </div>

          <div className="flex gap-1.5 mb-3 items-center flex-wrap">
            <FilterPill label="All" count={totalRows} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterPill label="Errors" count={errors.length} active={filter === 'errors'} onClick={() => setFilter('errors')} />
            <FilterPill label="Warnings" count={warnings.length} active={filter === 'warnings'} onClick={() => setFilter('warnings')} />
            <FilterPill label="Valid" count={validCount} active={filter === 'valid'} onClick={() => setFilter('valid')} />
            <span className="ml-auto text-xs text-gray-500">
              Showing {shown.length} of {filtered.length} rows
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
                {shown.length === 0 && (
                  <tr className="border-t border-gray-100">
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">
                      No rows in this view.
                    </td>
                  </tr>
                )}
                {shown.map((row) => (
                  <tr
                    key={row.csvRowNum}
                    className={cn(
                      'border-t border-gray-100',
                      row.status === 'error' && 'bg-status-error/[0.04]',
                      row.status === 'warning' && 'bg-status-warning/[0.04]',
                    )}
                  >
                    <td className="px-3 py-3 align-top">
                      <span className="font-mono text-[11px] text-gray-400">{row.csvRowNum}</span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm">{row.name}</p>
                      {row.message && (
                        <p
                          className={cn(
                            'flex items-start gap-1.5 mt-1 text-xs font-medium',
                            row.status === 'error' ? 'text-status-error' : 'text-status-warning',
                          )}
                        >
                          {row.status === 'error' ? (
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          )}
                          <span>{row.message}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-mono text-xs text-gray-700">{row.sku || '—'}</span>
                    </td>
                    <td className="px-3 py-3 align-top text-sm">{row.brand || '—'}</td>
                    <td className="px-3 py-3 align-top text-sm">{row.category || '—'}</td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-mono font-semibold">{row.price || '—'}</span>
                    </td>
                    <td className="px-3 py-3 align-top text-sm font-mono">{row.stock || '—'}</td>
                    <td className="px-3 py-3 align-top text-sm font-mono">{row.moq || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Lightbulb className="h-3.5 w-3.5 text-status-warning" />
            Tip: fix errors in your CSV and re-upload to maximize your import. Anything still
            red when you commit will be reported and skipped.
          </p>
        </>
      )}

      <WizardFoot
        leftText={
          <>
            <strong className="text-success">{validCount} valid</strong>
            <span className="text-gray-500"> · </span>
            <strong className="text-status-warning">{warnings.length} warnings</strong>
            <span className="text-gray-500"> · </span>
            <strong className="text-status-error">{errors.length} errors</strong>
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
              disabled={loading || !ready || validCount === 0}
              rightIcon={<Check className="h-3.5 w-3.5" />}
              onClick={onCommit}
            >
              Commit {validCount} valid
            </Button>
          </>
        }
      />
    </div>
  );
}

function ImportingStep({ rowCount }: { rowCount: number }) {
  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-sm text-gray-500 mb-4">
        Hang tight — products and your pricing are written together in a single transaction.
      </p>
      <div className="flex items-center gap-3.5 bg-white border border-brand-blue/30 rounded-xl px-5 py-4 mb-5">
        <Loader2 className="h-7 w-7 text-brand-blue animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            Creating products · {rowCount.toLocaleString()} rows submitted
          </p>
          <p className="text-[11px] font-mono text-gray-500 mt-0.5">
            Rows with unresolved errors are skipped and reported
          </p>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 text-sm font-semibold">Activity</div>
        <ul className="py-1.5">
          <ActivityRow status="done" label="Validating row schema" timing="done" />
          <ActivityRow status="done" label="Resolving categories" timing="done" />
          <ActivityRow status="active" label="Creating products & pricing" timing="in progress" />
        </ul>
      </div>
    </div>
  );
}

function reasonIcon(reason: string): React.ReactNode {
  const r = reason.toLowerCase();
  if (r.includes('duplicate')) return <Copy className="h-3.5 w-3.5" />;
  if (r.includes('price')) return <DollarSign className="h-3.5 w-3.5" />;
  if (r.includes('category')) return <FolderX className="h-3.5 w-3.5" />;
  if (r.includes('image')) return <ImageOff className="h-3.5 w-3.5" />;
  if (r.includes('missing')) return <XCircle className="h-3.5 w-3.5" />;
  return <X className="h-3.5 w-3.5" />;
}

function DoneStep({
  result,
  warningsCount,
  totalRows,
  displayRows,
  onReset,
}: {
  result: CommitData;
  warningsCount: number;
  totalRows: number;
  displayRows: DisplayRow[];
  onReset: () => void;
}) {
  const nameByRow = new Map(displayRows.map((r) => [r.csvRowNum, r.name]));
  const skipped = [...result.skipped].sort((a, b) => a.csvRowNum - b.csvRowNum);

  const downloadErrorCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      'row,sku,reason',
      ...skipped.map((s) => `${s.csvRowNum},${esc(s.sku)},${esc(s.reason)}`),
    ];
    downloadTextFile('import-errors.csv', lines.join('\n'), 'text/csv');
  };

  const downloadReceipt = () => {
    downloadTextFile(
      'import-receipt.json',
      JSON.stringify(
        {
          importedAt: new Date().toISOString(),
          totalRows,
          created: result.created,
          warnings: warningsCount,
          skipped,
        },
        null,
        2,
      ),
      'application/json',
    );
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl p-9 text-center mb-4">
        <div className="w-20 h-20 rounded-full bg-success/[0.12] text-success flex items-center justify-center mx-auto mb-4">
          <Check className="h-9 w-9" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Import complete</h2>
        <p className="text-sm text-gray-500 mt-1.5">
          {result.created.toLocaleString()} of {totalRows.toLocaleString()} rows are live in
          your catalog.
          {skipped.length > 0 && ` ${skipped.length} rows were skipped — see below.`}
        </p>
        <div className="grid grid-cols-3 gap-3.5 mt-6 max-w-md mx-auto">
          <ResultStat label="Created" value={result.created} tone="success" />
          <ResultStat label="With warnings" value={warningsCount} tone="warning" />
          <ResultStat label="Skipped" value={skipped.length} tone="error" />
        </div>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => (window.location.href = '/products')}
          >
            View {result.created.toLocaleString()} new products
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
            onClick={downloadReceipt}
          >
            Download import receipt
          </Button>
        </div>
      </div>

      {skipped.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning" />
            <p className="text-sm font-semibold">
              {skipped.length} row{skipped.length === 1 ? '' : 's'} skipped
            </p>
            <button
              type="button"
              onClick={downloadErrorCsv}
              className="ml-auto text-xs text-brand-teal hover:text-brand-teal-dark font-medium"
            >
              Download error CSV
            </button>
          </div>
          {skipped.slice(0, MAX_DISPLAY_ROWS).map((s) => (
            <div
              key={s.csvRowNum}
              className="flex items-center gap-3.5 px-5 py-3 border-b border-gray-100 last:border-0 text-sm"
            >
              <span className="font-mono text-[11px] text-gray-400 w-12">Row {s.csvRowNum}</span>
              <span className="flex-1 truncate">{nameByRow.get(s.csvRowNum) ?? (s.sku || '—')}</span>
              <span className="text-xs text-status-warning inline-flex items-center gap-1.5">
                {reasonIcon(s.reason)}
                {s.reason}
              </span>
            </div>
          ))}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-2 text-sm text-gray-500">
            <Lightbulb className="h-3.5 w-3.5 text-status-warning" />
            Fix these in your CSV and re-upload — rows already imported are skipped as
            duplicates, so only the fixed rows land.
          </div>
        </div>
      )}
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

function MapStatusBadge({ status }: { status: 'required' | 'mapped' | 'unmapped' | 'skipped' }) {
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
