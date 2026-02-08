import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getAgents } from '@/api/client'
import { AgentCard } from '@/components/AgentCard'
import { Users } from 'lucide-react'

export const Route = createFileRoute('/agents')({
  component: AgentsPage,
})

function AgentsPage() {
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
  })
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading agents...</div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="w-8 h-8 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400">
            Configure emotional profiles and mood baselines for each agent.
          </p>
        </div>
      </div>
      
      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      
      {agents.length === 0 && (
        <div className="p-12 text-center text-gray-500 bg-gray-900 rounded-xl border border-gray-800">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No agents configured</p>
          <p className="text-sm mt-1">
            Add agent JSON files to configs/agents/
          </p>
        </div>
      )}
    </div>
  )
}
