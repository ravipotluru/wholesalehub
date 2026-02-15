'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Menu, ShoppingCart, LogOut, User, ChevronDown } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useUIStore } from '@/store/uiStore';
import { NotificationDropdown } from './NotificationDropdown';
import { useState, useRef, useEffect } from 'react';

export function Header() {
  const { data: session } = useSession();
  const { itemCount } = useCartStore();
  const { toggleMobileSidebar } = useUIStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const user = session?.user as Record<string, unknown> | undefined;
  const role = user?.role as string;
  const showCart = role === 'RETAILER';

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 lg:px-6 sticky top-0 z-30">
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden p-2 hover:bg-gray-100 rounded-lg mr-2"
      >
        <Menu className="h-5 w-5 text-dark" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {showCart && (
          <Link
            href="/cart"
            className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ShoppingCart className="h-5 w-5 text-dark" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-orange text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </Link>
        )}

        <NotificationDropdown />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-brand-blue rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">
                {session?.user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-dark">{session?.user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{role?.toLowerCase().replace('_', ' ')}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-500 hidden sm:block" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2 text-sm text-dark hover:bg-gray-50"
                onClick={() => setDropdownOpen(false)}
              >
                <User className="h-4 w-4" />
                Settings
              </Link>
              <hr className="my-1" />
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2 px-4 py-2 text-sm text-status-error hover:bg-gray-50 w-full text-left"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
