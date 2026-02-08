import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { MoodDeltaSlider } from './MoodSlider'
import { ALL_MOODS, MOOD_EMOJI, cn } from '@/lib/utils'

interface TriggerMoodEditorProps {
  triggerMoodMap: Record<string, Record<string, number>>
  onChange: (map: Record<string, Record<string, number>>) => void
}

export function TriggerMoodEditor({ triggerMoodMap, onChange }: TriggerMoodEditorProps) {
  const [expandedTrigger, setExpandedTrigger] = useState<string | null>(null)
  const [newTriggerName, setNewTriggerName] = useState('')
  
  const triggers = Object.keys(triggerMoodMap)
  
  const handleMoodChange = (trigger: string, moodId: string, value: number) => {
    const newMap = { ...triggerMoodMap }
    if (!newMap[trigger]) newMap[trigger] = {}
    
    if (value === 0) {
      delete newMap[trigger][moodId]
    } else {
      newMap[trigger][moodId] = value
    }
    
    // Remove trigger if empty
    if (Object.keys(newMap[trigger]).length === 0) {
      delete newMap[trigger]
    }
    
    onChange(newMap)
  }
  
  const addTrigger = () => {
    if (!newTriggerName.trim() || triggerMoodMap[newTriggerName]) return
    
    const name = newTriggerName.trim().toLowerCase().replace(/\s+/g, '_')
    onChange({
      ...triggerMoodMap,
      [name]: {}
    })
    setNewTriggerName('')
    setExpandedTrigger(name)
  }
  
  const removeTrigger = (trigger: string) => {
    const newMap = { ...triggerMoodMap }
    delete newMap[trigger]
    onChange(newMap)
    if (expandedTrigger === trigger) setExpandedTrigger(null)
  }
  
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="text-sm text-gray-400 mb-1">Defined Triggers</div>
        <div className="text-2xl font-bold text-white">{triggers.length}</div>
      </div>
      
      {/* Trigger List */}
      <div className="space-y-2">
        {triggers.map(trigger => {
          const moods = triggerMoodMap[trigger] || {}
          const moodEntries = Object.entries(moods)
          const isExpanded = expandedTrigger === trigger
          
          return (
            <div key={trigger} className="border border-gray-800 rounded-lg overflow-hidden">
              {/* Header */}
              <div 
                className={cn(
                  "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                  isExpanded ? "bg-gray-800" : "bg-gray-900 hover:bg-gray-800/50"
                )}
                onClick={() => setExpandedTrigger(isExpanded ? null : trigger)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                
                <span className="font-medium text-white capitalize">
                  {trigger.replace(/_/g, ' ')}
                </span>
                
                <div className="flex-1 flex flex-wrap gap-1">
                  {moodEntries.slice(0, 4).map(([mood, val]) => (
                    <span
                      key={mood}
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        val > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                      )}
                    >
                      {MOOD_EMOJI[mood]} {val > 0 ? '+' : ''}{val}
                    </span>
                  ))}
                  {moodEntries.length > 4 && (
                    <span className="text-xs text-gray-500">+{moodEntries.length - 4}</span>
                  )}
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTrigger(trigger)
                  }}
                  className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-4 bg-gray-900/50 border-t border-gray-800 space-y-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Mood Effects
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ALL_MOODS.map(moodId => (
                      <MoodDeltaSlider
                        key={moodId}
                        moodId={moodId}
                        value={moods[moodId] || 0}
                        onChange={(val) => handleMoodChange(trigger, moodId, val)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      
      {/* Add Trigger */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newTriggerName}
          onChange={(e) => setNewTriggerName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTrigger()}
          placeholder="New trigger name..."
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={addTrigger}
          disabled={!newTriggerName.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
      
      {/* Common Triggers Suggestions */}
      {triggers.length < 5 && (
        <div className="pt-4 border-t border-gray-800">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Common Triggers
          </div>
          <div className="flex flex-wrap gap-2">
            {['compliment', 'criticism', 'teasing', 'comfort', 'gratitude', 'rejection', 'apology']
              .filter(t => !triggers.includes(t))
              .slice(0, 4)
              .map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => {
                    onChange({ ...triggerMoodMap, [suggestion]: {} })
                    setExpandedTrigger(suggestion)
                  }}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                >
                  + {suggestion}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
