import { Link } from '@tanstack/react-router'
import { MOOD_EMOJI, getMoodBgColor, cn } from '@/lib/utils'
import type { AgentSummary } from '@/api/client'

interface AgentCardProps {
  agent: AgentSummary
}

export function AgentCard({ agent }: AgentCardProps) {
  const topMoods = Object.entries(agent.mood_baseline || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
  
  const totalMoods = Object.keys(agent.mood_baseline || {}).length
  
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      className="block p-5 bg-gray-900 rounded-xl border border-gray-800 hover:border-violet-500/50 hover:bg-gray-800/50 transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white group-hover:text-violet-300 transition-colors">
            {agent.name}
          </h3>
          <p className="text-sm text-gray-500 line-clamp-2">
            {agent.description || 'No description'}
          </p>
        </div>
        <div className="text-3xl opacity-50 group-hover:opacity-100 transition-opacity">
          {topMoods[0] ? MOOD_EMOJI[topMoods[0][0]] : '🤖'}
        </div>
      </div>
      
      {/* Top Moods */}
      <div className="flex flex-wrap gap-2">
        {topMoods.map(([mood, val]) => (
          <span
            key={mood}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs",
              getMoodBgColor(mood)
            )}
          >
            <span>{MOOD_EMOJI[mood]}</span>
            <span className="capitalize text-white">{mood}</span>
            <span className="text-gray-300">{val}</span>
          </span>
        ))}
        {totalMoods > 4 && (
          <span className="text-xs text-gray-500 self-center">
            +{totalMoods - 4} more
          </span>
        )}
      </div>
      
      {/* Stats */}
      <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between text-xs text-gray-500">
        <span>{totalMoods} active moods</span>
        <span className="text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
          Edit →
        </span>
      </div>
    </Link>
  )
}
