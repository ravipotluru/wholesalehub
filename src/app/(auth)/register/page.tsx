'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Package, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { registerSchema, type RegisterInput } from '@/lib/validators';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'RETAILER',
    },
  });

  const password = watch('password', '');
  const role = watch('role');

  const passwordChecks = [
    { label: '12+ characters', met: password.length >= 12 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const onSubmit = async (data: RegisterInput) => {
    setError('');
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || 'Registration failed');
        return;
      }

      router.push('/login?registered=true');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-4xl">
      <div className="grid lg:grid-cols-5 gap-0 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Form Column */}
        <div className="lg:col-span-3 p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-brand-orange rounded-lg flex items-center justify-center">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-dark">Create your account</h1>
              <p className="text-sm text-gray-500">Join WholesaleHub today</p>
            </div>
          </div>

          {error && (
            <div className="bg-status-error/10 border border-status-error/20 rounded-lg p-3 mb-6">
              <p className="text-sm text-status-error">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="firstName"
                label="First Name"
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                id="lastName"
                label="Last Name"
                error={errors.lastName?.message}
                {...register('lastName')}
              />
            </div>

            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@company.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              id="businessName"
              label="Business Name"
              error={errors.businessName?.message}
              {...register('businessName')}
            />

            <Input
              id="phone"
              label="Phone (optional)"
              type="tel"
              {...register('phone')}
            />

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-dark mb-2">I am a...</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`border-2 rounded-lg p-3 cursor-pointer transition-colors ${role === 'RETAILER' ? 'border-brand-teal bg-brand-teal/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" value="RETAILER" {...register('role')} className="sr-only" />
                  <p className="font-medium text-dark">Retailer</p>
                  <p className="text-xs text-gray-500 mt-1">I buy products to sell in my store</p>
                </label>
                <label className={`border-2 rounded-lg p-3 cursor-pointer transition-colors ${role === 'WHOLESALER' ? 'border-brand-teal bg-brand-teal/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" value="WHOLESALER" {...register('role')} className="sr-only" />
                  <p className="font-medium text-dark">Wholesaler</p>
                  <p className="text-xs text-gray-500 mt-1">I sell products to retailers</p>
                </label>
              </div>
              {errors.role && <p className="mt-1 text-sm text-status-error">{errors.role.message}</p>}
            </div>

            {/* Conditional fields */}
            {role === 'RETAILER' && (
              <div className="space-y-4 bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-dark">Store Information</p>
                <Input id="storeType" label="Store Type" placeholder="Smoke Shop, Gas Station..." {...register('storeType')} />
                <Input id="storeAddress" label="Address" {...register('storeAddress')} />
                <div className="grid grid-cols-3 gap-3">
                  <Input id="storeCity" label="City" {...register('storeCity')} />
                  <Input id="storeState" label="State" {...register('storeState')} />
                  <Input id="storeZip" label="ZIP" {...register('storeZip')} />
                </div>
              </div>
            )}

            {role === 'WHOLESALER' && (
              <div className="space-y-4 bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-dark">License Information</p>
                <Input id="licenseNumber" label="License Number" {...register('licenseNumber')} />
                <Input id="licenseState" label="License State" {...register('licenseState')} />
              </div>
            )}

            {/* Password */}
            <div className="relative">
              <Input
                id="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                error={errors.password?.message}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Password strength */}
            {password && (
              <div className="flex flex-wrap gap-2">
                {passwordChecks.map((check) => (
                  <span
                    key={check.label}
                    className={`inline-flex items-center gap-1 text-xs ${check.met ? 'text-success' : 'text-gray-400'}`}
                  >
                    {check.met ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {check.label}
                  </span>
                ))}
              </div>
            )}

            <Input
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            {/* Checkboxes */}
            <div className="space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" {...register('ageVerified')} className="mt-1 rounded border-gray-300 text-brand-teal focus:ring-brand-teal" />
                <span className="text-sm text-gray-600">I verify that I am 21 years or older</span>
              </label>
              {errors.ageVerified && <p className="text-sm text-status-error">{errors.ageVerified.message}</p>}

              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" {...register('termsAccepted')} className="mt-1 rounded border-gray-300 text-brand-teal focus:ring-brand-teal" />
                <span className="text-sm text-gray-600">I agree to the Terms of Service and Privacy Policy</span>
              </label>
              {errors.termsAccepted && <p className="text-sm text-status-error">{errors.termsAccepted.message}</p>}
            </div>

            <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-teal hover:text-brand-teal-dark font-medium">
              Sign In
            </Link>
          </p>
        </div>

        {/* Benefits Column */}
        <div className="lg:col-span-2 bg-brand-blue p-8 flex flex-col justify-center text-white hidden lg:flex">
          <h2 className="text-xl font-bold mb-6">Why WholesaleHub?</h2>
          <div className="space-y-6">
            <div>
              <p className="font-semibold">Compare Prices Instantly</p>
              <p className="text-sm text-white/70 mt-1">See all supplier prices side-by-side, sorted cheapest first</p>
            </div>
            <div>
              <p className="font-semibold">Save Time & Money</p>
              <p className="text-sm text-white/70 mt-1">No more calling multiple suppliers for quotes</p>
            </div>
            <div>
              <p className="font-semibold">Track Everything</p>
              <p className="text-sm text-white/70 mt-1">Orders, inventory, and shipments all in one place</p>
            </div>
            <div>
              <p className="font-semibold">Trusted Suppliers</p>
              <p className="text-sm text-white/70 mt-1">Verified wholesalers with ratings and reviews</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
