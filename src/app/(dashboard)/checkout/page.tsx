'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreditCard,
  Building2,
  Banknote,
  ShoppingBag,
  CheckCircle2,
  ArrowLeft,
  MapPin,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { checkoutSchema, type CheckoutInput } from '@/lib/validators';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface CreatedOrder {
  orderId: string;
  orderNumber: string;
  wholesalerName: string;
  total: number;
  status: string;
  itemCount: number;
}

const paymentOptions = [
  {
    value: 'NET30' as const,
    label: 'Net 30',
    description: 'Pay within 30 days of invoice',
    icon: Building2,
  },
  {
    value: 'CREDIT_CARD' as const,
    label: 'Credit Card',
    description: 'Pay now with credit card',
    icon: CreditCard,
  },
  {
    value: 'ACH' as const,
    label: 'ACH Transfer',
    description: 'Direct bank transfer',
    icon: Banknote,
  },
];

export default function CheckoutPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrders, setCreatedOrders] = useState<CreatedOrder[] | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      shippingAddress: '',
      shippingCity: '',
      shippingState: '',
      shippingZip: '',
      paymentMethod: 'NET30',
      orderNotes: '',
    },
  });

  const selectedPayment = watch('paymentMethod');

  // Fetch cart for order summary
  const { data: cartData, isLoading, error, refetch } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const res = await fetch('/api/cart');
      if (!res.ok) throw new Error('Failed to fetch cart');
      return res.json();
    },
  });

  const onSubmit = async (formData: CheckoutInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: formData.shippingAddress,
          shippingCity: formData.shippingCity,
          shippingState: formData.shippingState,
          shippingZip: formData.shippingZip,
          paymentMethod: formData.paymentMethod,
          orderNotes: formData.orderNotes,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to place order');
      }

      const result = await res.json();
      setCreatedOrders(result.orders);
      toast.success(result.message || 'Orders placed successfully!');

      // Redirect to orders after a short delay so user sees confirmation
      setTimeout(() => {
        router.push('/orders');
      }, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Skeleton className="w-48 h-8 mb-6" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <Skeleton className="w-full h-48" variant="rectangular" />
            </Card>
            <Card>
              <Skeleton className="w-full h-32" variant="rectangular" />
            </Card>
          </div>
          <Card>
            <Skeleton className="w-full h-64" variant="rectangular" />
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <ErrorBanner message="Failed to load cart data" onRetry={() => refetch()} />
      </div>
    );
  }

  // Empty cart
  if (!cartData?.groups?.length) {
    return (
      <EmptyState
        icon="cart"
        title="Your cart is empty"
        description="Add items to your cart before checking out."
        actionLabel="Browse Products"
        onAction={() => router.push('/marketplace')}
      />
    );
  }

  // Order confirmation view
  if (createdOrders) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card className="text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h1 className="text-2xl font-bold text-dark">Orders Placed Successfully!</h1>
            <p className="text-gray-500">
              {createdOrders.length} order{createdOrders.length !== 1 ? 's' : ''} created and sent to supplier{createdOrders.length !== 1 ? 's' : ''}.
            </p>

            <div className="w-full space-y-3 mt-4">
              {createdOrders.map((order) => (
                <div
                  key={order.orderId}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="text-left">
                    <p className="font-semibold text-dark text-sm">{order.orderNumber}</p>
                    <p className="text-xs text-gray-500">{order.wholesalerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold font-mono text-dark text-sm">
                      {formatCurrency(order.total)}
                    </p>
                    <p className="text-xs text-gray-500">{order.itemCount} item{order.itemCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-400 mt-2">
              Redirecting to your orders...
            </p>

            <Button
              variant="primary"
              onClick={() => router.push('/orders')}
              className="mt-2"
            >
              View Orders
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const subtotal = cartData.summary.totalAmount;
  const tax = Math.round(subtotal * 0.0825 * 100) / 100;
  const shipping = 0;
  const total = Math.round((subtotal + tax + shipping) * 100) / 100;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/cart')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <h1 className="text-2xl font-bold text-brand-blue">Checkout</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column: Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Shipping Address */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-brand-teal" />
                  Shipping Address
                </CardTitle>
              </CardHeader>

              <div className="space-y-4">
                <Input
                  id="shippingAddress"
                  label="Street Address"
                  placeholder="123 Main St, Suite 100"
                  error={errors.shippingAddress?.message}
                  {...register('shippingAddress')}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    id="shippingCity"
                    label="City"
                    placeholder="Houston"
                    error={errors.shippingCity?.message}
                    {...register('shippingCity')}
                  />
                  <Input
                    id="shippingState"
                    label="State"
                    placeholder="TX"
                    error={errors.shippingState?.message}
                    {...register('shippingState')}
                  />
                  <Input
                    id="shippingZip"
                    label="ZIP Code"
                    placeholder="77001"
                    error={errors.shippingZip?.message}
                    {...register('shippingZip')}
                  />
                </div>
              </div>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-brand-teal" />
                  Payment Method
                </CardTitle>
              </CardHeader>

              <div className="space-y-3">
                {paymentOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedPayment === option.value;

                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-brand-teal bg-brand-teal/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => setValue('paymentMethod', option.value)}
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-brand-teal' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-brand-teal" />
                        )}
                      </div>
                      <Icon
                        className={`h-5 w-5 flex-shrink-0 ${
                          isSelected ? 'text-brand-teal' : 'text-gray-400'
                        }`}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-dark text-sm">{option.label}</p>
                        <p className="text-xs text-gray-500">{option.description}</p>
                      </div>
                    </label>
                  );
                })}
                {errors.paymentMethod && (
                  <p className="text-sm text-status-error">{errors.paymentMethod.message}</p>
                )}
              </div>
            </Card>

            {/* Order Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-brand-teal" />
                  Order Notes
                </CardTitle>
              </CardHeader>

              <textarea
                id="orderNotes"
                placeholder="Special delivery instructions, PO numbers, or other notes..."
                rows={3}
                className="input-field resize-none"
                {...register('orderNotes')}
              />
            </Card>
          </div>

          {/* Right Column: Order Summary */}
          <div>
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-brand-teal" />
                  Order Summary
                </CardTitle>
              </CardHeader>

              {/* Supplier Groups */}
              <div className="space-y-4 mb-6">
                {cartData.groups.map((group: Record<string, unknown>) => (
                  <div key={group.wholesalerId as string} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-dark text-sm">{group.wholesalerName as string}</p>
                      <Badge variant="default">
                        {(group.items as Record<string, unknown>[]).length} item{(group.items as Record<string, unknown>[]).length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {(group.items as Record<string, unknown>[]).map((item) => (
                        <div key={item.id as string} className="flex justify-between text-xs text-gray-500">
                          <span className="truncate mr-2">
                            {(item.product as Record<string, unknown>).name as string} x{item.quantity as number}
                          </span>
                          <span className="font-mono flex-shrink-0">
                            {formatCurrency(item.subtotal as number)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-mono font-medium">{formatCurrency(group.subtotal as number)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-2 text-sm border-t border-gray-100 pt-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-mono">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Shipping</span>
                  <span className="text-success font-medium">Free</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Est. Tax (8.25%)</span>
                  <span className="font-mono">{formatCurrency(tax)}</span>
                </div>
                <hr />
                <div className="flex justify-between text-base">
                  <span className="font-semibold text-dark">Total</span>
                  <span className="font-bold font-mono text-dark">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Place Order */}
              <div className="mt-6 space-y-3">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  size="lg"
                  isLoading={isSubmitting}
                  leftIcon={<ShoppingBag className="h-5 w-5" />}
                >
                  Place Order
                </Button>

                <p className="text-xs text-gray-400 text-center">
                  By placing your order, you agree to our terms and conditions.
                  {cartData.groups.length > 1 && (
                    <> Your cart will be split into {cartData.groups.length} separate orders, one per supplier.</>
                  )}
                </p>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
