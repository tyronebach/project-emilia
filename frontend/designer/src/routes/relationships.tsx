import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getRelationships } from '@/api/client'
import { Heart, ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/relationships')({
  component: RelationshipsPage,
})

function RelationshipsPage() {
  const { data: relationships = [], isLoading } = useQuery({
    queryKey: ['relationships'],
    queryFn: getRelationships,
  })
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading relationships...</div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Heart className="w-8 h-8 text-pink-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Relationship Types</h1>
          <p className="text-gray-400">
            Configure trigger→mood mappings for different relationship dynamics.
          </p>
        </div>
      </div>
      
      {/* Relationship List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {relationships.map(rel => (
          <Link
            key={rel.type}
            to="/relationships/$type"
            params={{ type: rel.type }}
            className="block p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-pink-500/50 hover:bg-gray-800/50 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white capitalize group-hover:text-pink-300 transition-colors">
                  {rel.type}
                </h3>
                <p className="text-gray-400 mt-1 line-clamp-2">
                  {rel.description || 'No description'}
                </p>
                
                <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                  <span>{rel.trigger_count} triggers</span>
                </div>
              </div>
              
              <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-pink-400 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
      
      {relationships.length === 0 && (
        <div className="p-12 text-center text-gray-500 bg-gray-900 rounded-xl border border-gray-800">
          <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No relationship types configured</p>
          <p className="text-sm mt-1">
            Add relationship JSON files to configs/relationships/
          </p>
        </div>
      )}
    </div>
  )
}
