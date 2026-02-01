import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/utils/api';
import type { Session } from '@/types';

export function useSessionsQuery() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<Session[]> => {
      const res = await fetchWithAuth('/api/sessions/list');
      if (!res.ok) {
        throw new Error(`Failed to fetch sessions: ${res.status}`);
      }
      const data = await res.json();
      return data.sessions || [];
    },
  });
}
