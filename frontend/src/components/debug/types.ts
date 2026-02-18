import type { ComponentType } from 'react';

export interface DebugSection {
  id: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  defaultEnabled?: boolean;
}

/** Compaction debug info returned by /api/manage/debug/compaction/room/{roomId} */
export interface CompactionDebug {
  session_id?: string;
  room_id?: string;
  session_name: string | null;
  message_count_cached: number;
  message_count_actual: number;
  summary: string | null;
  summary_length: number;
  summary_updated_at: number | null;
  compaction_count: number;
  config: { threshold: number; keep_recent: number; model: string };
  should_compact: boolean;
}
