import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAgent, updateAgent } from '@/api/client'
import { MoodBaselineEditor } from '@/components/MoodBaselineEditor'
import { ArrowLeft, Save, RotateCcw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { MOOD_EMOJI, cn } from '@/lib/utils'

export const Route = createFileRoute('/agents/$agentId')({
  component: AgentEditorPage,
})

function AgentEditorPage() {
  const { agentId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => getAgent(agentId),
  })
  
  const [baseline, setBaseline] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [volatility, setVolatility] = useState(1.0)
  const [recovery, setRecovery] = useState(1.0)
  const [decayRate, setDecayRate] = useState(0.3)
  const [hasChanges, setHasChanges] = useState(false)
  
  // Load agent data
  useEffect(() => {
    if (agent) {
      setBaseline(agent.mood_baseline || {})
      setName(agent.name || '')
      setDescription(agent.description || '')
      setVolatility(agent.volatility ?? 1.0)
      setRecovery(agent.recovery ?? 1.0)
      setDecayRate(agent.mood_decay_rate ?? 0.3)
      setHasChanges(false)
    }
  }, [agent])
  
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof updateAgent>[1]) => updateAgent(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setHasChanges(false)
    },
  })
  
  const handleSave = () => {
    mutation.mutate({
      name,
      description,
      mood_baseline: baseline,
      volatility,
      recovery,
      mood_decay_rate: decayRate,
    })
  }
  
  const handleReset = () => {
    if (agent) {
      setBaseline(agent.mood_baseline || {})
      setName(agent.name || '')
      setDescription(agent.description || '')
      setVolatility(agent.volatility ?? 1.0)
      setRecovery(agent.recovery ?? 1.0)
      setDecayRate(agent.mood_decay_rate ?? 0.3)
      setHasChanges(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading agent...</div>
      </div>
    )
  }
  
  if (error || !agent) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-4">Agent not found</p>
        <Link to="/agents" className="text-violet-400 hover:underline">
          Back to agents
        </Link>
      </div>
    )
  }
  
  // Get dominant emoji
  const topMood = Object.entries(baseline).sort(([, a], [, b]) => b - a)[0]
  const emoji = topMood ? MOOD_EMOJI[topMood[0]] : '🤖'
  
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/agents"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="text-4xl">{emoji}</div>
          <div>
            <h1 className="text-2xl font-bold text-white">{name}</h1>
            <p className="text-gray-400">{description || 'No description'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || mutation.isPending}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
              hasChanges
                ? "bg-violet-600 hover:bg-violet-500 text-white"
                : "bg-gray-800 text-gray-500 cursor-not-allowed"
            )}
          >
            <Save className="w-4 h-4" />
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      
      {/* Status */}
      {mutation.isSuccess && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm">
          ✓ Changes saved successfully
        </div>
      )}
      {mutation.isError && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
          Failed to save: {(mutation.error as Error).message}
        </div>
      )}
      
      {/* Basic Info */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 space-y-4">
        <h2 className="text-lg font-semibold text-white">Basic Info</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setHasChanges(true) }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setHasChanges(true) }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
      </div>
      
      {/* Personality Parameters */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 space-y-4">
        <h2 className="text-lg font-semibold text-white">Personality Parameters</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Volatility
              <span className="text-xs text-gray-500 ml-1">(emotional reactivity)</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="3"
              value={volatility}
              onChange={(e) => { setVolatility(parseFloat(e.target.value) || 1.0); setHasChanges(true) }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Recovery
              <span className="text-xs text-gray-500 ml-1">(return to baseline)</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="3"
              value={recovery}
              onChange={(e) => { setRecovery(parseFloat(e.target.value) || 1.0); setHasChanges(true) }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Mood Decay Rate
              <span className="text-xs text-gray-500 ml-1">(per turn)</span>
            </label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={decayRate}
              onChange={(e) => { setDecayRate(parseFloat(e.target.value) || 0.3); setHasChanges(true) }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
      </div>
      
      {/* Mood Baseline */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Mood Baseline</h2>
        <MoodBaselineEditor
          baseline={baseline}
          onChange={(b) => { setBaseline(b); setHasChanges(true) }}
        />
      </div>
    </div>
  )
}
