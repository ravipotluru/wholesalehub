import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-sm', className)}>
      <ol className="flex items-center gap-1 flex-wrap">
        {items.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}
              {isLast || !item.href ? (
                <span
                  className="text-dark font-medium truncate max-w-[200px] sm:max-w-none flex items-center gap-1"
                  title={item.label}
                >
                  {isFirst && <Home className="h-3.5 w-3.5 flex-shrink-0" />}
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-brand-teal hover:underline truncate max-w-[200px] sm:max-w-none flex items-center gap-1"
                  title={item.label}
                >
                  {isFirst && <Home className="h-3.5 w-3.5 flex-shrink-0" />}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
