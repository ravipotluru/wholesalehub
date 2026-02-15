'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Package, Eye, EyeOff } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/validators';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setError('');
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        return;
      }

      router.push('/marketplace');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="card">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand-orange rounded-xl flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-dark">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your WholesaleHub account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-status-error/10 border border-status-error/20 rounded-lg p-3 mb-6">
            <p className="text-sm text-status-error">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="you@company.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="relative">
            <Input
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
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

          <div className="flex justify-end">
            <Link href="#" className="text-sm text-brand-teal hover:text-brand-teal-dark">
              Forgot Password?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isSubmitting}
          >
            Sign In
          </Button>
        </form>

        {/* Register link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-brand-teal hover:text-brand-teal-dark font-medium">
            Register
          </Link>
        </p>

        {/* Demo credentials */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center mb-2">Demo Accounts</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="font-medium">Retailer</p>
              <p>retailer@test.com</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="font-medium">Wholesaler</p>
              <p>wholesaler@test.com</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="font-medium">Admin</p>
              <p>admin@test.com</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="font-medium">Warehouse</p>
              <p>warehouse@test.com</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">Password: Password123!</p>
        </div>
      </div>
    </div>
  );
}
