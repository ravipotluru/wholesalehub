'use client';

import { useEffect, useState } from 'react';
import { Plus, MapPin, Star, Pencil, Trash2, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface Location {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  contactName?: string | null;
  contactPhone?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

const EMPTY_FORM = {
  label: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  contactName: '',
  contactPhone: '',
  isDefault: false,
};

export function LocationsManager() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Location | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch('/api/retailer/locations');
      if (res.status === 404) {
        setLocations([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load locations.');
      const body = (await res.json()) as { locations: Location[] };
      setLocations(body.locations ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-3 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading locations…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner title="Error" message={error} />}

      {locations.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-10 w-10" />}
          title="No locations yet"
          description="Add the first ship-to address. Most chains start with their main warehouse."
          action={
            <Button
              variant="secondary"
              size="md"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setCreating(true)}
            >
              Add location
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setCreating(true)}
            >
              Add location
            </Button>
          </div>
          <div className="space-y-2">
            {locations.map((loc) => (
              <LocationCard
                key={loc.id}
                location={loc}
                onEdit={() => setEditing(loc)}
                onChange={refresh}
                setError={setError}
              />
            ))}
          </div>
        </>
      )}

      {(creating || editing) && (
        <LocationFormModal
          initial={editing ?? null}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function LocationCard({
  location,
  onEdit,
  onChange,
  setError,
}: {
  location: Location;
  onEdit: () => void;
  onChange: () => void;
  setError: (e: string | null) => void;
}) {
  const onDelete = async () => {
    if (!confirm(`Delete "${location.label}"?`)) return;
    try {
      const res = await fetch(`/api/retailer/locations/${location.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Could not delete.');
      }
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
        <MapPin className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-dark">{location.label}</p>
          {location.isDefault && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue font-semibold">
              <Star className="h-3 w-3" />
              Default
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {location.address}, {location.city}, {location.state} {location.zipCode}
        </p>
        {location.contactName && (
          <p className="text-xs text-gray-400 mt-1">
            {location.contactName}
            {location.contactPhone ? ` · ${location.contactPhone}` : ''}
          </p>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button variant="ghost" size="sm" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function LocationFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Location | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ...(initial
      ? {
          label: initial.label,
          address: initial.address,
          city: initial.city,
          state: initial.state,
          zipCode: initial.zipCode,
          contactName: initial.contactName ?? '',
          contactPhone: initial.contactPhone ?? '',
          isDefault: initial.isDefault,
        }
      : {}),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initial);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const url = isEdit ? `/api/retailer/locations/${initial!.id}` : '/api/retailer/locations';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Save failed.');
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit location' : 'Add location'} size="md">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && <ErrorBanner message={error} />}
        <Input
          label="Label"
          placeholder="e.g. Main St — Cleveland"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          required
        />
        <Input
          label="Street address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          required
        />
        <div className="grid grid-cols-3 gap-2">
          <Input
            label="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            required
          />
          <Input
            label="State"
            placeholder="OH"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
            required
          />
          <Input
            label="ZIP"
            value={form.zipCode}
            onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Contact name (optional)"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          />
          <Input
            label="Contact phone (optional)"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
        </div>
        <label
          className={cn(
            'flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md',
            form.isDefault ? 'bg-brand-blue/5' : 'hover:bg-gray-50',
          )}
        >
          <input
            type="checkbox"
            className="rounded text-brand-blue focus:ring-brand-blue"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          />
          <Check className={cn('h-4 w-4', form.isDefault ? 'text-brand-blue' : 'text-transparent')} />
          <span className="text-dark">Set as default ship-to</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={submitting}
            leftIcon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add location'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
