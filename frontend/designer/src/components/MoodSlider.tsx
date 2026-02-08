import * as Slider from '@radix-ui/react-slider'
import { MOOD_EMOJI, getMoodColor, cn } from '@/lib/utils'

interface MoodSliderProps {
  moodId: string
  value: number
  onChange: (value: number) => void
  max?: number
  showLabel?: boolean
  compact?: boolean
}

export function MoodSlider({ 
  moodId, 
  value, 
  onChange, 
  max = 10,
  showLabel = true,
  compact = false
}: MoodSliderProps) {
  const emoji = MOOD_EMOJI[moodId] || '❓'
  const gradientClass = getMoodColor(moodId)
  const isActive = value > 0
  
  return (
    <div className={cn(
      "rounded-lg border transition-all",
      compact ? "p-2" : "p-3",
      isActive 
        ? "bg-gray-800/50 border-gray-700" 
        : "bg-gray-900/30 border-gray-800/50"
    )}>
      {showLabel && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{emoji}</span>
            <span className={cn(
              "text-sm font-medium capitalize",
              isActive ? "text-white" : "text-gray-500"
            )}>
              {moodId}
            </span>
          </div>
          <span className={cn(
            "text-sm font-mono w-8 text-right",
            isActive ? "text-white" : "text-gray-600"
          )}>
            {value}
          </span>
        </div>
      )}
      
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        max={max}
        step={1}
      >
        <Slider.Track className="bg-gray-800 relative grow rounded-full h-2">
          <Slider.Range className={cn(
            "absolute h-full rounded-full bg-gradient-to-r",
            gradientClass
          )} />
        </Slider.Track>
        <Slider.Thumb 
          className={cn(
            "block w-4 h-4 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 transition-transform hover:scale-110",
            isActive 
              ? `bg-gradient-to-r ${gradientClass} focus:ring-violet-500` 
              : "bg-gray-600 focus:ring-gray-500"
          )}
        />
      </Slider.Root>
    </div>
  )
}

// Compact delta slider for trigger mood maps (range: -5 to +5)
export function MoodDeltaSlider({ 
  moodId, 
  value, 
  onChange 
}: { 
  moodId: string
  value: number
  onChange: (value: number) => void 
}) {
  const emoji = MOOD_EMOJI[moodId] || '❓'
  const isPositive = value > 0
  const isNegative = value < 0
  
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-gray-800/50">
      <span className="text-sm">{emoji}</span>
      <span className="text-xs text-gray-400 capitalize w-20 truncate">{moodId}</span>
      
      <Slider.Root
        className="relative flex items-center select-none touch-none flex-1 h-4"
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={-5}
        max={5}
        step={1}
      >
        <Slider.Track className="bg-gray-700 relative grow rounded-full h-1.5">
          <Slider.Range className={cn(
            "absolute h-full rounded-full",
            isPositive ? "bg-emerald-500" : isNegative ? "bg-red-500" : "bg-gray-600"
          )} />
        </Slider.Track>
        <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow focus:outline-none" />
      </Slider.Root>
      
      <span className={cn(
        "text-xs font-mono w-6 text-right",
        isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-gray-500"
      )}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  )
}
