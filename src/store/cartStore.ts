import { create } from 'zustand';

interface CartState {
  itemCount: number;
  isOpen: boolean;
  setItemCount: (count: number) => void;
  incrementCount: () => void;
  decrementCount: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  isOpen: false,
  setItemCount: (count) => set({ itemCount: count }),
  incrementCount: () => set((state) => ({ itemCount: state.itemCount + 1 })),
  decrementCount: () => set((state) => ({ itemCount: Math.max(0, state.itemCount - 1) })),
  toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
}));
