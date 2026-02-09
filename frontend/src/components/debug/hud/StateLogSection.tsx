import { useStatsStore } from '../../../store/statsStore';

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export function StateLogSection() {
  const { stateLog } = useStatsStore();

  return (
    <div>
      <div className="text-[10px] text-text-secondary uppercase mb-1">State Log</div>
      <div className="max-h-[200px] overflow-y-auto bg-white/5 rounded p-1">
        <div className="space-y-0.5 text-[10px]">
          {stateLog.slice(0, 50).map((entry, index) => (
            <div key={`${entry.timestamp.getTime()}-${index}`} className="flex gap-1">
              <span className="text-text-secondary/60 font-mono shrink-0">
                {formatTime(entry.timestamp)}
              </span>
              <span className="text-text-primary">{entry.text}</span>
            </div>
          ))}
          {stateLog.length === 0 && (
            <div className="text-text-secondary/50 text-center py-2">No events yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
