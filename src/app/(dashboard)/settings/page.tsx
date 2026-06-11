'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  User,
  Bell,
  Lock,
  Mail,
  Shield,
  Building2,
  Save,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

// ---------- Types ----------
interface UserProfile {
  name: string;
  email: string;
  role: string;
  organization: string;
}

// ---------- Mock Data ----------
const MOCK_USER: UserProfile = {
  name: 'John Doe',
  email: 'john.doe@retailstore.com',
  role: 'ADMIN',
  organization: 'Downtown Smoke Shop',
};

// ---------- Helpers ----------
function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { variant: 'info' | 'success' | 'warning' | 'default'; label: string }> = {
    ADMIN: { variant: 'info', label: 'Admin' },
    MANAGER: { variant: 'success', label: 'Manager' },
    WAREHOUSE_STAFF: { variant: 'warning', label: 'Warehouse Staff' },
    VIEWER: { variant: 'default', label: 'Viewer' },
  };
  const { variant, label } = config[role] ?? { variant: 'default' as const, label: role };
  return <Badge variant={variant}>{label}</Badge>;
}

function SectionDivider() {
  return <hr className="border-gray-100" />;
}

// ---------- Toggle Switch ----------
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-dark">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-brand-teal' : 'bg-gray-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

// ---------- Main Page ----------
export default function SettingsPage() {
  const [user] = useState<UserProfile>(MOCK_USER);
  const [isLoading] = useState(false);

  // Profile form state
  const [profileName, setProfileName] = useState(MOCK_USER.name);
  const [profileEmail, setProfileEmail] = useState(MOCK_USER.email);

  // Notification preferences
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [inventoryAlerts, setInventoryAlerts] = useState(true);
  const [priceChanges, setPriceChanges] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="w-32 h-8 mb-2" />
        <Skeleton className="w-64 h-4" />
        <Card>
          <Skeleton className="w-full h-48" variant="rectangular" />
        </Card>
        <Card>
          <Skeleton className="w-full h-48" variant="rectangular" />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-dark">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account preferences</p>
      </div>

      {/* Quick links to dedicated settings pages */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/settings/notifications"
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow flex items-start gap-3"
        >
          <Bell className="h-5 w-5 text-brand-blue flex-shrink-0 mt-0.5" />
          <span>
            <span className="block text-sm font-semibold text-dark">Notification preferences</span>
            <span className="block text-xs text-gray-500 mt-0.5">Per-channel toggles for every category</span>
          </span>
        </Link>
        <Link
          href="/settings/verification"
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow flex items-start gap-3"
        >
          <Shield className="h-5 w-5 text-brand-blue flex-shrink-0 mt-0.5" />
          <span>
            <span className="block text-sm font-semibold text-dark">Buyer verification</span>
            <span className="block text-xs text-gray-500 mt-0.5">Upload licenses to unlock restricted SKUs</span>
          </span>
        </Link>
        <Link
          href="/settings/locations"
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow flex items-start gap-3"
        >
          <Building2 className="h-5 w-5 text-brand-blue flex-shrink-0 mt-0.5" />
          <span>
            <span className="block text-sm font-semibold text-dark">Ship-to locations</span>
            <span className="block text-xs text-gray-500 mt-0.5">Manage your store addresses</span>
          </span>
        </Link>
      </div>

      {/* Current User Info Card */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-brand-blue">
              {user.name.split(' ').map((n) => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-dark">{user.name}</h2>
              <RoleBadge role={user.role} />
            </div>
            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Building2 className="h-3.5 w-3.5" />
                {user.organization}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand-teal" />
            <CardTitle>Profile Settings</CardTitle>
          </div>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Placeholder - no-op
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="profile-name"
                label="Full Name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Your full name"
              />
              <Input
                id="profile-email"
                label="Email Address"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="profile-org"
                label="Organization"
                value={user.organization}
                disabled
                helperText="Contact support to change organization"
              />
              <div>
                <label className="block text-sm font-medium text-dark mb-1.5">Role</label>
                <div className="flex items-center gap-2 h-[42px]">
                  <Shield className="h-4 w-4 text-gray-400" />
                  <RoleBadge role={user.role} />
                  <span className="text-xs text-gray-400">Managed by admin</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Save className="h-4 w-4" />}
                type="submit"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-teal" />
            <CardTitle>Notification Preferences</CardTitle>
          </div>
          <CardDescription>Choose what notifications you want to receive</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-gray-100">
            <Toggle
              checked={emailNotifications}
              onChange={setEmailNotifications}
              label="Email Notifications"
              description="Receive notifications via email"
            />
            <Toggle
              checked={orderUpdates}
              onChange={setOrderUpdates}
              label="Order Updates"
              description="Get notified when order status changes"
            />
            <Toggle
              checked={inventoryAlerts}
              onChange={setInventoryAlerts}
              label="Inventory Alerts"
              description="Low stock and discrepancy alerts"
            />
            <Toggle
              checked={priceChanges}
              onChange={setPriceChanges}
              label="Price Change Alerts"
              description="Notified when supplier prices change"
            />
            <Toggle
              checked={weeklyDigest}
              onChange={setWeeklyDigest}
              label="Weekly Digest"
              description="Summary of activity sent every Monday"
            />
          </div>
          <div className="flex justify-end pt-4">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Save className="h-4 w-4" />}
              onClick={() => {
                // Placeholder - no-op
              }}
            >
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password Change */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-brand-teal" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Placeholder - no-op
            }}
            className="space-y-4"
          >
            <Input
              id="current-password"
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="new-password"
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                helperText="Minimum 8 characters with uppercase, number, and symbol"
              />
              <Input
                id="confirm-password"
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Lock className="h-4 w-4" />}
                type="submit"
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Update Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
