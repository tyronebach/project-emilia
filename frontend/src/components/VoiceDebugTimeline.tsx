/**
 * VoiceDebugTimeline - Reusable voice debug event list
 */

import { useMemo, useEffect, useRef, useState } from 'react';
import type { VoiceDebugEvent } from '../services/VoiceService';

export type VoiceDebugEntry = {
  id: string;
  time: string;
  event: VoiceDebugEvent;
};

type VoiceDebugFilter = 'all' | 'state' | 'wake' | 'vad' | 'stt';

interface VoiceDebugTimelineProps {
  entries: VoiceDebugEntry[];
  onClear?: () => void;
  className?: string;
  listHeightClass?: string;
}

export function VoiceDebugTimeline({
  entries,
  onClear,
  className = '',
  listHeightClass = 'h-40',
}: VoiceDebugTimelineProps) {
  const [filter, setFilter] = useState<VoiceDebugFilter>('all');
  const listRef = useRef<HTMLDivElement | null>(null);

  const getCategory = (event: VoiceDebugEvent): VoiceDebugFilter => {
    switch (event.type) {
      case 'state':
        return 'state';
      case 'wakeword':
        return 'wake';
      case 'vad_speech_start':
      case 'vad_speech_end':
      case 'vad_misfire':
      case 'vad_paused':
      case 'vad_resumed':
        return 'vad';
      case 'stt_sending':
      case 'stt_result':
      case 'stt_empty':
      case 'stt_error':
        return 'stt';
      default:
        return 'state';
    }
  };

  const formatEvent = (event: VoiceDebugEvent): {
    label: string;
    detail: string;
    tone: string;
  } => {
    switch (event.type) {
      case 'state':
        return { label: 'State', detail: `${event.from} → ${event.to}`, tone: 'text-blue-400' };
      case 'wakeword':
        return { label: 'Wake', detail: event.keyword, tone: 'text-indigo-400' };
      case 'vad_speech_start':
        return { label: 'VAD', detail: 'speech start', tone: 'text-green-400' };
      case 'vad_speech_end':
        return {
          label: 'VAD',
          detail: `speech end • ${event.ms}ms • ${event.samples} samples`,
          tone: 'text-green-400',
        };
      case 'vad_misfire':
        return { label: 'VAD', detail: 'misfire (too short)', tone: 'text-yellow-400' };
      case 'vad_paused':
        return { label: 'VAD', detail: 'paused for STT', tone: 'text-text-secondary' };
      case 'vad_resumed':
        return { label: 'VAD', detail: 'resumed', tone: 'text-text-secondary' };
      case 'stt_sending':
        return { label: 'STT', detail: `sending (${event.bytes} bytes)`, tone: 'text-sky-400' };
      case 'stt_result':
        return { label: 'STT', detail: `text: "${event.text}"`, tone: 'text-emerald-400' };
      case 'stt_empty':
        return { label: 'STT', detail: 'empty transcript', tone: 'text-yellow-400' };
      case 'stt_error':
        return { label: 'STT', detail: `error: ${event.message}`, tone: 'text-red-400' };
      default:
        return { label: 'Voice', detail: 'unknown event', tone: 'text-text-secondary' };
    }
  };

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter(({ event }) => getCategory(event) === filter);
  }, [entries, filter]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [filteredEntries]);

  return (
    <div className={`p-3 bg-bg-tertiary rounded-lg space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-secondary">Debug Timeline</div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {(['all', 'state', 'wake', 'vad', 'stt'] as const).map((value) => {
          const isActive = filter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`px-2 py-1 rounded-full border text-[10px] uppercase tracking-wide transition-colors ${
                isActive
                  ? 'bg-bg-secondary border-text-secondary text-text-primary'
                  : 'border-bg-secondary text-text-secondary hover:text-text-primary'
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
      <div ref={listRef} className={`${listHeightClass} overflow-auto space-y-1`}>
        {filteredEntries.length === 0 ? (
          <div className="text-xs text-text-secondary">No events yet.</div>
        ) : (
          filteredEntries.map(({ id, time, event }) => {
            const formatted = formatEvent(event);
            return (
              <div key={id} className="flex items-start gap-2 text-xs">
                <div className="text-text-secondary w-20 shrink-0">{time}</div>
                <div className="px-2 py-0.5 rounded bg-bg-secondary text-[10px] uppercase tracking-wide text-text-secondary">
                  {formatted.label}
                </div>
                <div className={`flex-1 break-words ${formatted.tone}`}>{formatted.detail}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default VoiceDebugTimeline;
