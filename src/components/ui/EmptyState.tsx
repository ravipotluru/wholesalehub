import { Package, Search, ShoppingCart, FileText } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: 'package' | 'search' | 'cart' | 'document';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const icons = {
  package: Package,
  search: Search,
  cart: ShoppingCart,
  document: FileText,
};

export function EmptyState({ icon = 'package', title, description, actionLabel, onAction, className }: EmptyStateProps) {
  const Icon = icons[icon];

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4', className)}>
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-dark mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4 text-center max-w-md">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
