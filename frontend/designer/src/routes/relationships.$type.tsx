import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getRelationship, updateRelationship } from '@/api/client'
import { TriggerMoodEditor } from '@/components/TriggerMoodEditor'
import { ArrowLeft, Save, RotateCcw, Heart } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/relationships/$type')({
  component: RelationshipEditorPage,
})

function RelationshipEditorPage() {
  const { type } = Route.useParams()
  const queryClient = useQueryClient()
  
  const { data: relationship, isLoading, error } = useQuery({
    queryKey: ['relationship', type],
    queryFn: () => getRelationship(type),
  })
  
  const [description, setDescription] = useState('')
  const [triggerMoodMap, setTriggerMoodMap] = useState<Record<string, Record<string, number>>>({})
  const [hasChanges, setHasChanges] = useState(false)
  
  // Load relationship data
  useEffect(() => {
    if (relationship) {
      setDescription(relationship.description || '')
      setTriggerMoodMap(relationship.trigger_mood_map || {})
      setHasChanges(false)
    }
  }, [relationship])
  
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof updateRelationship>[1]) => updateRelationship(type, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationship', type] })
      queryClient.invalidateQueries({ queryKey: ['relationships'] })
      setHasChanges(false)
    },
  })
  
  const handleSave = () => {
    mutation.mutate({
      description,
      trigger_mood_map: triggerMoodMap,
    })
  }
  
  const handleReset = () => {
    if (relationship) {
      setDescription(relationship.description || '')
      setTriggerMoodMap(relationship.trigger_mood_map || {})
      setHasChanges(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading relationship...</div>
      </div>
    )
  }
  
  if (error || !relationship) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-4">Relationship type not found</p>
        <Link to="/relationships" className="text-violet-400 hover:underline">
          Back to relationships
        </Link>
      </div>
    )
  }
  
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/relationships"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Heart className="w-8 h-8 text-pink-400" />
          <div>
            <h1 className="text-2xl font-bold text-white capitalize">{type}</h1>
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
                ? "bg-pink-600 hover:bg-pink-500 text-white"
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
      
      {/* Description */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <label className="block text-sm text-gray-400 mb-2">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setHasChanges(true) }}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-pink-500"
          placeholder="Describe this relationship type..."
        />
      </div>
      
      {/* Trigger Mood Map */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Trigger → Mood Mappings</h2>
        <p className="text-sm text-gray-400 mb-6">
          Define how each trigger affects mood levels. Positive values increase the mood, 
          negative values decrease it.
        </p>
        <TriggerMoodEditor
          triggerMoodMap={triggerMoodMap}
          onChange={(map) => { setTriggerMoodMap(map); setHasChanges(true) }}
        />
      </div>
    </div>
  )
}
