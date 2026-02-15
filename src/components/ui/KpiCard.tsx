import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: { value: number; label: string };
  className?: string;
  valueColor?: string;
}

export function KpiCard({ title, value, icon: Icon, change, className, valueColor }: KpiCardProps) {
  return (
    <div className={cn('card', className)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="w-10 h-10 bg-brand-teal/10 rounded-lg flex items-center justify-center">
          <Icon className="h-5 w-5 text-brand-teal" />
        </div>
      </div>
      <p className={cn('text-2xl font-bold', valueColor || 'text-dark')}>{value}</p>
      {change && (
        <p className={cn('text-xs mt-1', change.value >= 0 ? 'text-success' : 'text-status-error')}>
          {change.value >= 0 ? '+' : ''}{change.value}% {change.label}
        </p>
      )}
    </div>
  );
}
