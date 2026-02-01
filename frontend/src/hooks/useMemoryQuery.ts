import { useQuery } from '@tanstack/react-query';
import type { Memory } from '@/types';

export function useMemoryQuery() {
  return useQuery({
    queryKey: ['memory'],
    queryFn: async (): Promise<Memory[]> => {
      const res = await fetch('/api/memory');
      if (!res.ok) {
        if (res.status === 404) {
          return []; // API not implemented
        }
        throw new Error(`Failed to fetch memory: ${res.status}`);
      }
      const data = await res.json();
      return data.memories || [];
    },
  });
}
