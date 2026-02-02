import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Avatar } from '../types';

interface UserState {
  currentUser: User | null;
  currentAvatar: Avatar | null;
  setUser: (user: User | null) => void;
  setAvatar: (avatar: Avatar | null) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      currentUser: null,
      currentAvatar: null,
      setUser: (user) => set({ currentUser: user }),
      setAvatar: (avatar) => set({ currentAvatar: avatar }),
      logout: () => set({ currentUser: null, currentAvatar: null }),
    }),
    {
      name: 'emilia-user-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentAvatar: state.currentAvatar,
      }),
    }
  )
);

export default useUserStore;
