import { MoodSlider } from './MoodSlider'
import { ALL_MOODS, MOOD_CATEGORIES, MOOD_EMOJI, cn } from '@/lib/utils'

interface MoodBaselineEditorProps {
  baseline: Record<string, number>
  onChange: (baseline: Record<string, number>) => void
}

export function MoodBaselineEditor({ baseline, onChange }: MoodBaselineEditorProps) {
  const handleMoodChange = (moodId: string, value: number) => {
    const newBaseline = { ...baseline }
    if (value === 0) {
      delete newBaseline[moodId]
    } else {
      newBaseline[moodId] = value
    }
    onChange(newBaseline)
  }
  
  const activeMoods = Object.entries(baseline).filter(([, v]) => v > 0)
  const activeCount = activeMoods.length
  
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div>
          <div className="text-sm text-gray-400">Active Moods</div>
          <div className="text-2xl font-bold text-white">{activeCount} / 16</div>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap gap-1">
            {activeMoods
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([mood, val]) => (
                <span
                  key={mood}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-700 text-xs"
                >
                  <span>{MOOD_EMOJI[mood]}</span>
                  <span className="capitalize">{mood}</span>
                  <span className="text-gray-400">{val}</span>
                </span>
              ))}
            {activeCount > 5 && (
              <span className="text-xs text-gray-500 self-center ml-1">
                +{activeCount - 5} more
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Categories */}
      {Object.entries(MOOD_CATEGORIES).map(([category, moods]) => (
        <div key={category}>
          <h3 className={cn(
            "text-sm font-medium uppercase tracking-wider mb-3",
            category === 'positive' && "text-emerald-400",
            category === 'negative' && "text-red-400",
            category === 'neutral' && "text-violet-400"
          )}>
            {category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {moods.map(moodId => (
              <MoodSlider
                key={moodId}
                moodId={moodId}
                value={baseline[moodId] || 0}
                onChange={(val) => handleMoodChange(moodId, val)}
              />
            ))}
          </div>
        </div>
      ))}
      
      {/* Quick Actions */}
      <div className="flex gap-2 pt-4 border-t border-gray-800">
        <button
          onClick={() => onChange({})}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
        >
          Reset All
        </button>
        <button
          onClick={() => {
            const balanced: Record<string, number> = {}
            ALL_MOODS.forEach(m => { balanced[m] = 5 })
            onChange(balanced)
          }}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
        >
          Set All to 5
        </button>
      </div>
    </div>
  )
}
