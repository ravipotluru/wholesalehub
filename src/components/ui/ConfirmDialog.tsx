'use client';

import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const variantConfig = {
  danger: {
    icon: AlertTriangle,
    iconColor: 'text-status-error',
    iconBg: 'bg-status-error/10',
    buttonClass: 'bg-status-error text-white hover:bg-red-600 focus:ring-status-error',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-brand-orange',
    iconBg: 'bg-brand-orange/10',
    buttonClass: 'bg-brand-orange text-white hover:bg-brand-orange/90 focus:ring-brand-orange',
  },
  info: {
    icon: Info,
    iconColor: 'text-brand-blue',
    iconBg: 'bg-brand-blue/10',
    buttonClass: 'bg-brand-blue text-white hover:bg-brand-blue/90 focus:ring-brand-blue',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  isLoading = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="text-center">
        <div
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4',
            config.iconBg
          )}
        >
          <Icon className={cn('h-7 w-7', config.iconColor)} />
        </div>

        <h3 className="text-lg font-semibold text-dark mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 border-2 border-gray-300 text-dark hover:bg-gray-50 px-6 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 px-6 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
              config.buttonClass
            )}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
