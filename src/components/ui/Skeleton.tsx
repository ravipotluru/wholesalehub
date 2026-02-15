import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string;
  height?: string;
}

export function Skeleton({ className, variant = 'text', width, height }: SkeletonProps) {
  const variants = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={cn('animate-pulse bg-gray-200', variants[variant], className)}
      style={{ width, height }}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card">
      <Skeleton variant="rectangular" className="w-full h-48 mb-4" />
      <Skeleton className="w-20 h-5 mb-2" />
      <Skeleton className="w-full h-5 mb-1" />
      <Skeleton className="w-2/3 h-5 mb-3" />
      <Skeleton className="w-1/3 h-4 mb-2" />
      <div className="flex justify-between items-center mb-3">
        <Skeleton className="w-24 h-6" />
        <Skeleton className="w-16 h-4" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="w-1/2 h-10" />
        <Skeleton className="w-1/2 h-10" />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <Skeleton className="w-full h-4" />
        </td>
      ))}
    </tr>
  );
}
