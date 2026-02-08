import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getAgents, getRelationships, getMoods } from '@/api/client'
import { AgentCard } from '@/components/AgentCard'
import { Users, Heart, Sparkles, ArrowRight } from 'lucide-react'
import { MOOD_EMOJI } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
  })
  
  const { data: relationships = [] } = useQuery({
    queryKey: ['relationships'],
    queryFn: getRelationships,
  })
  
  const { data: moods = [] } = useQuery({
    queryKey: ['moods'],
    queryFn: getMoods,
  })
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">
          Design and tune agent emotional profiles and relationship dynamics.
        </p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Agents"
          value={agents.length}
          color="violet"
        />
        <StatCard
          icon={<Heart className="w-5 h-5" />}
          label="Relationship Types"
          value={relationships.length}
          color="pink"
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          label="Mood Types"
          value={moods.length}
          color="amber"
        />
      </div>
      
      {/* Moods Overview */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Available Moods</h2>
        <div className="flex flex-wrap gap-2">
          {moods.map(mood => (
            <span
              key={mood.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 rounded-full text-sm"
              title={mood.description}
            >
              <span>{MOOD_EMOJI[mood.id] || '❓'}</span>
              <span className="text-gray-300 capitalize">{mood.id}</span>
            </span>
          ))}
        </div>
      </div>
      
      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Agents */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Agents</h2>
            <Link 
              to="/agents" 
              className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {agents.slice(0, 3).map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            {agents.length === 0 && (
              <div className="p-8 text-center text-gray-500 bg-gray-900 rounded-xl border border-gray-800">
                No agents configured
              </div>
            )}
          </div>
        </div>
        
        {/* Relationships */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Relationship Types</h2>
            <Link 
              to="/relationships" 
              className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {relationships.map(rel => (
              <Link
                key={rel.type}
                to="/relationships/$type"
                params={{ type: rel.type }}
                className="block p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-pink-500/50 hover:bg-gray-800/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white capitalize group-hover:text-pink-300 transition-colors">
                      {rel.type}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-1">
                      {rel.description || 'No description'}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {rel.trigger_count} triggers
                  </div>
                </div>
              </Link>
            ))}
            {relationships.length === 0 && (
              <div className="p-8 text-center text-gray-500 bg-gray-900 rounded-xl border border-gray-800">
                No relationship types configured
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode
  label: string
  value: number
  color: 'violet' | 'pink' | 'amber' 
}) {
  const colors = {
    violet: 'from-violet-500/20 to-violet-600/20 border-violet-500/30 text-violet-400',
    pink: 'from-pink-500/20 to-pink-600/20 border-pink-500/30 text-pink-400',
    amber: 'from-amber-500/20 to-amber-600/20 border-amber-500/30 text-amber-400',
  }
  
  return (
    <div className={`p-5 rounded-xl border bg-gradient-to-br ${colors[color]}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-2xl font-bold text-white">{value}</div>
          <div className="text-sm">{label}</div>
        </div>
      </div>
    </div>
  )
}
