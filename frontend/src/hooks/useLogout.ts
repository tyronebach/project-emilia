import { useCallback } from 'react';
import { useAppStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';

export function useLogout() {
  return useCallback(() => {
    useAppStore.getState().clearRoomId();
    useChatStore.getState().clearMessages();
    useUserStore.getState().clearUser();
  }, []);
}

export default useLogout;
