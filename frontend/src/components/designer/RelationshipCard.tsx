import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { getRelationship, updateRelationship } from '../../utils/designerApi';
import KeyValueEditor from './KeyValueEditor';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import type { DesignerRelationship, DesignerRelationshipSummary } from '../../types/designer';

interface RelationshipCardProps {
  summary: DesignerRelationshipSummary;
  onDelete: (type: string) => void;
  deleting: boolean;
}

function RelationshipCard({ summary, onDelete, deleting }: RelationshipCardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<DesignerRelationship | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ['designer', 'relationships', summary.type],
    queryFn: () => getRelationship(summary.type),
    enabled: expanded,
  });

  // Initialize draft when detail loads
  if (detail && !draft) {
    setDraft(detail);
  }

  const updateMut = useMutation({
    mutationFn: (updates: Partial<DesignerRelationship>) => updateRelationship(summary.type, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer', 'relationships'] });
    },
  });

  const hasChanges = draft && detail ? JSON.stringify(draft) !== JSON.stringify(detail) : false;

  const handleSave = () => {
    if (!draft) return;
    updateMut.mutate({
      description: draft.description,
      modifiers: draft.modifiers,
      behaviors: draft.behaviors,
      response_modifiers: draft.response_modifiers,
      trigger_mood_map: draft.trigger_mood_map,
      example_responses: draft.example_responses,
    });
  };

  const handleReset = () => {
    if (detail) setDraft({ ...detail });
  };

  const handleExpand = () => {
    if (!expanded) {
      setDraft(null); // Reset draft so it re-initializes from fresh detail
    }
    setExpanded(!expanded);
  };

  const patchDraft = (updates: Partial<DesignerRelationship>) => {
    if (draft) setDraft({ ...draft, ...updates });
  };

  const asNumberRecord = (obj: Record<string, unknown> | undefined): Record<string, number> => {
    if (!obj) return {};
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = typeof v === 'number' ? v : parseFloat(String(v)) || 0;
    }
    return result;
  };

  return (
    <>
      <div
        className={`bg-bg-secondary/70 border rounded-xl ${hasChanges ? 'border-accent/50' : 'border-white/10'}`}
      >
        {/* Header */}
        <button
          className="w-full flex items-center justify-between text-left p-4"
          onClick={handleExpand}
        >
          <div>
            <span className="font-medium text-sm">{summary.type}</span>
            <span className="text-xs text-text-secondary ml-2">{summary.description}</span>
            {summary.trigger_count > 0 && (
              <span className="ml-2 text-[10px] bg-white/10 rounded-full px-1.5 py-0.5">
                {summary.trigger_count} triggers
              </span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && draft && (
          <div className="px-4 pb-4 space-y-4">
            <div className="border-t border-white/10 pt-3" />

            <div>
              <label className="block text-xs text-text-secondary mb-1">Description</label>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => patchDraft({ description: e.target.value })}
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <KeyValueEditor
              label="Modifiers"
              data={asNumberRecord(draft.modifiers)}
              onChange={(modifiers) => patchDraft({ modifiers })}
              keyPlaceholder="modifier"
            />

            <KeyValueEditor
              label="Behaviors"
              data={asNumberRecord(draft.behaviors)}
              onChange={(behaviors) => patchDraft({ behaviors })}
              keyPlaceholder="behavior"
            />

            <KeyValueEditor
              label="Response Modifiers"
              data={asNumberRecord(draft.response_modifiers)}
              onChange={(response_modifiers) => patchDraft({ response_modifiers })}
              keyPlaceholder="modifier"
            />

            {/* Trigger Mood Map */}
            <div>
              <label className="block text-xs text-text-secondary mb-2">Trigger Mood Map</label>
              {Object.entries(draft.trigger_mood_map || {}).map(([trigger, moods]) => (
                <div key={trigger} className="mb-3 ml-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-medium">{trigger}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        const next = { ...draft.trigger_mood_map };
                        delete next[trigger];
                        patchDraft({ trigger_mood_map: next });
                      }}
                      className="text-text-secondary hover:text-error"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <KeyValueEditor
                    label=""
                    data={moods as Record<string, number>}
                    onChange={(updated) =>
                      patchDraft({
                        trigger_mood_map: { ...draft.trigger_mood_map, [trigger]: updated },
                      })
                    }
                    keyPlaceholder="mood"
                  />
                </div>
              ))}
              <TriggerAdder
                onAdd={(trigger) =>
                  patchDraft({
                    trigger_mood_map: { ...draft.trigger_mood_map, [trigger]: {} },
                  })
                }
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-bg-tertiary">
              <Button
                variant="ghost"
                size="xs"
                className="text-error hover:text-error"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </Button>
              <div className="flex gap-2">
                {hasChanges && (
                  <span className="text-xs text-accent self-center mr-2">Unsaved changes</span>
                )}
                {hasChanges && (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || updateMut.isPending}
                >
                  <Save className="w-4 h-4" />
                  {updateMut.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {expanded && !draft && (
          <div className="px-4 pb-4 text-center text-xs text-text-secondary">Loading details...</div>
        )}
      </div>

      <DeleteConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete relationship "${summary.type}"?`}
        description="This will permanently remove this relationship type and all its configuration."
        onConfirm={() => {
          onDelete(summary.type);
          setConfirmDelete(false);
        }}
        loading={deleting}
      />
    </>
  );
}

function TriggerAdder({ onAdd }: { onAdd: (trigger: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="add trigger..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onAdd(value.trim());
            setValue('');
          }
        }}
        className="flex-1 bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1 text-xs font-mono focus:border-accent focus:outline-none placeholder:text-text-secondary/50"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => {
          if (value.trim()) {
            onAdd(value.trim());
            setValue('');
          }
        }}
        disabled={!value.trim()}
        className="text-text-secondary hover:text-accent"
      >
        +
      </Button>
    </div>
  );
}

export default RelationshipCard;
