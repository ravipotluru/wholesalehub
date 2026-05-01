import { Package, Search, ShoppingCart, FileText } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Either a string preset OR a custom ReactNode (e.g. a Lucide icon). */
  icon?: 'package' | 'search' | 'cart' | 'document' | ReactNode;
  title: string;
  description?: string;
  /** Legacy: button label + handler. Prefer `action`. */
  actionLabel?: string;
  onAction?: () => void;
  /** Custom action node (e.g. <Button>…</Button> or a <Link>). Takes precedence over actionLabel/onAction. */
  action?: ReactNode;
  className?: string;
}

const presetIcons = {
  package: Package,
  search: Search,
  cart: ShoppingCart,
  document: FileText,
} as const;

function isPreset(v: unknown): v is keyof typeof presetIcons {
  return typeof v === 'string' && v in presetIcons;
}

export function EmptyState({
  icon = 'package',
  title,
  description,
  actionLabel,
  onAction,
  action,
  className,
}: EmptyStateProps) {
  let iconNode: ReactNode;
  if (isPreset(icon)) {
    const Icon = presetIcons[icon];
    iconNode = <Icon className="h-8 w-8 text-gray-400" />;
  } else {
    iconNode = icon;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4', className)}>
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
        {iconNode}
      </div>
      <h3 className="text-lg font-semibold text-dark mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4 text-center max-w-md">{description}</p>}
      {action ? (
        action
      ) : actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
