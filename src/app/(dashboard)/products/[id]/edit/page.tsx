'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Save,
  Package,
  DollarSign,
  Boxes,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ---------- Types ----------

interface ProductFormData {
  name: string;
  sku: string;
  brand: string;
  description: string;
  categoryId: string;
  wholesalePrice: number;
  msrp: number;
  minimumOrderQty: number;
  caseQuantity: number;
  pricePerCase: number;
  stockQuantity: number;
  stockStatus: string;
  leadTimeDays: number;
  onPromotion: boolean;
  promoPrice: number;
  promoStartDate: string;
  promoEndDate: string;
  ageRestricted: boolean;
  minimumAge: number;
  restrictedStates: string[];
}

// ---------- Constants ----------

const CATEGORY_OPTIONS = [
  { value: '', label: 'Select category...' },
  { value: 'cat-1', label: 'Disposable Vapes' },
  { value: 'cat-2', label: 'Nicotine Pouches' },
  { value: 'cat-3', label: 'Rolling Papers' },
  { value: 'cat-4', label: 'Cigars' },
  { value: 'cat-5', label: 'Accessories' },
  { value: 'cat-6', label: 'Lighters' },
  { value: 'cat-7', label: 'E-Liquid' },
];

const STOCK_STATUS_OPTIONS = [
  { value: 'IN_STOCK', label: 'In Stock' },
  { value: 'LOW_STOCK', label: 'Low Stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of Stock' },
  { value: 'BACKORDER', label: 'Backorder' },
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// ---------- Mock Data ----------

function getMockProduct(): ProductFormData {
  return {
    name: 'RAZ CA6000 Disposable Vape - Blue Razz',
    sku: 'RAZ-CA6K-BR',
    brand: 'RAZ',
    description: 'Premium disposable vape with 6000 puffs, blue razz flavor. Rechargeable with type-C.',
    categoryId: 'cat-1',
    wholesalePrice: 8.99,
    msrp: 14.99,
    minimumOrderQty: 10,
    caseQuantity: 200,
    pricePerCase: 1798.00,
    stockQuantity: 2500,
    stockStatus: 'IN_STOCK',
    leadTimeDays: 3,
    onPromotion: true,
    promoPrice: 7.99,
    promoStartDate: '2026-02-10',
    promoEndDate: '2026-02-28',
    ageRestricted: true,
    minimumAge: 21,
    restrictedStates: ['NY', 'CA', 'MA'],
  };
}

// ---------- Loading Skeleton ----------

function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="w-8 h-8" variant="circular" />
        <Skeleton className="w-48 h-8" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-48" variant="rectangular" />
      ))}
    </div>
  );
}

// ---------- Main Page ----------

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [isLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormData>(() => getMockProduct());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const updateField = <K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const toggleState = (state: string) => {
    setForm((prev) => {
      const current = prev.restrictedStates;
      if (current.includes(state)) {
        return { ...prev, restrictedStates: current.filter((s) => s !== state) };
      }
      return { ...prev, restrictedStates: [...current, state] };
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Product name is required';
    if (form.wholesalePrice <= 0) errors.wholesalePrice = 'Price must be greater than 0';
    if (form.minimumOrderQty < 1) errors.minimumOrderQty = 'MOQ must be at least 1';
    if (form.onPromotion && form.promoPrice <= 0) errors.promoPrice = 'Promo price is required';
    if (form.ageRestricted && form.minimumAge < 18) errors.minimumAge = 'Minimum age must be at least 18';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success('Product updated successfully!');
    router.push('/products');
  };

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/products')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-teal/10 rounded-lg flex items-center justify-center">
              <Edit className="h-5 w-5 text-brand-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-dark">Edit Product</h1>
              <p className="text-xs font-mono text-gray-400">{form.sku}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/products')}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leftIcon={<Save className="h-4 w-4" />}
            isLoading={isSaving}
            onClick={handleSave}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-brand-teal" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                id="name"
                label="Product Name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                error={formErrors.name}
              />
            </div>
            <div>
              <Input
                id="sku"
                label="SKU"
                value={form.sku}
                readOnly
                className="bg-gray-100 cursor-not-allowed"
                helperText="SKU cannot be changed after creation"
              />
            </div>
            <div>
              <Input
                id="brand"
                label="Brand"
                value={form.brand}
                onChange={(e) => updateField('brand', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className="input-field w-full resize-none"
              />
            </div>
            <div>
              <Select
                id="category"
                label="Category"
                options={CATEGORY_OPTIONS}
                value={form.categoryId}
                onChange={(e) => updateField('categoryId', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-brand-teal" />
            Pricing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                id="wholesalePrice"
                label="Wholesale Price ($)"
                type="number"
                step="0.01"
                min={0}
                value={form.wholesalePrice}
                onChange={(e) => updateField('wholesalePrice', parseFloat(e.target.value) || 0)}
                error={formErrors.wholesalePrice}
              />
            </div>
            <div>
              <Input
                id="msrp"
                label="MSRP ($)"
                type="number"
                step="0.01"
                min={0}
                value={form.msrp}
                onChange={(e) => updateField('msrp', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Input
                id="moq"
                label="Minimum Order Qty"
                type="number"
                min={1}
                value={form.minimumOrderQty}
                onChange={(e) => updateField('minimumOrderQty', parseInt(e.target.value, 10) || 1)}
                error={formErrors.minimumOrderQty}
              />
            </div>
            <div>
              <Input
                id="caseQty"
                label="Case Quantity"
                type="number"
                min={1}
                value={form.caseQuantity}
                onChange={(e) => updateField('caseQuantity', parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div>
              <Input
                id="pricePerCase"
                label="Price Per Case ($)"
                type="number"
                step="0.01"
                min={0}
                value={form.pricePerCase}
                onChange={(e) => updateField('pricePerCase', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-brand-teal" />
            Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                id="stockQty"
                label="Stock Quantity"
                type="number"
                min={0}
                value={form.stockQuantity}
                onChange={(e) => updateField('stockQuantity', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <Select
                id="stockStatus"
                label="Stock Status"
                options={STOCK_STATUS_OPTIONS}
                value={form.stockStatus}
                onChange={(e) => updateField('stockStatus', e.target.value)}
              />
            </div>
            <div>
              <Input
                id="leadTime"
                label="Lead Time (Days)"
                type="number"
                min={0}
                value={form.leadTimeDays}
                onChange={(e) => updateField('leadTimeDays', parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Promotion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-brand-teal" />
            Promotion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={cn(
                  'w-11 h-6 rounded-full transition-colors relative',
                  form.onPromotion ? 'bg-brand-teal' : 'bg-gray-300',
                )}
                onClick={() => updateField('onPromotion', !form.onPromotion)}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                    form.onPromotion ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </div>
              <span className="text-sm font-medium text-dark">On Promotion</span>
            </label>

            {form.onPromotion && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-14">
                <div>
                  <Input
                    id="promoPrice"
                    label="Promo Price ($)"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.promoPrice}
                    onChange={(e) => updateField('promoPrice', parseFloat(e.target.value) || 0)}
                    error={formErrors.promoPrice}
                  />
                </div>
                <div>
                  <Input
                    id="promoStart"
                    label="Start Date"
                    type="date"
                    value={form.promoStartDate}
                    onChange={(e) => updateField('promoStartDate', e.target.value)}
                  />
                </div>
                <div>
                  <Input
                    id="promoEnd"
                    label="End Date"
                    type="date"
                    value={form.promoEndDate}
                    onChange={(e) => updateField('promoEndDate', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-teal" />
            Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={cn(
                  'w-11 h-6 rounded-full transition-colors relative',
                  form.ageRestricted ? 'bg-brand-teal' : 'bg-gray-300',
                )}
                onClick={() => updateField('ageRestricted', !form.ageRestricted)}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                    form.ageRestricted ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </div>
              <span className="text-sm font-medium text-dark">Age Restricted</span>
            </label>

            {form.ageRestricted && (
              <div className="space-y-4 pl-14">
                <div className="max-w-xs">
                  <Input
                    id="minimumAge"
                    label="Minimum Age"
                    type="number"
                    min={18}
                    max={99}
                    value={form.minimumAge}
                    onChange={(e) => updateField('minimumAge', parseInt(e.target.value, 10) || 18)}
                    error={formErrors.minimumAge}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-2">Restricted States</label>
                  <div className="flex flex-wrap gap-1.5">
                    {US_STATES.map((state) => {
                      const isSelected = form.restrictedStates.includes(state);
                      return (
                        <button
                          key={state}
                          type="button"
                          onClick={() => toggleState(state)}
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium transition-colors',
                            isSelected
                              ? 'bg-status-error text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                          )}
                        >
                          {state}
                        </button>
                      );
                    })}
                  </div>
                  {form.restrictedStates.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      {form.restrictedStates.length} state{form.restrictedStates.length !== 1 ? 's' : ''} restricted
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottom Actions */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => router.push('/products')}>
          Cancel
        </Button>
        <Button
          variant="primary"
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={isSaving}
          onClick={handleSave}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
