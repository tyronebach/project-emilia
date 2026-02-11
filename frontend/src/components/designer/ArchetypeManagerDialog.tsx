import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Trash2, Upload } from 'lucide-react';
import type { Archetype } from '../../types/designer';
import {
  deleteArchetype,
  generateArchetype,
  getArchetype,
  updateArchetype,
} from '../../utils/designerApiV2';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

interface ArchetypeManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archetypes: Archetype[];
  onArchetypeSelected: (id: string) => void;
}

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\\s_-]/g, '')
    .replace(/\\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function ArchetypeManagerDialog({
  open,
  onOpenChange,
  archetypes,
  onArchetypeSelected,
}: ArchetypeManagerDialogProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');

  const [newName, setNewName] = useState('');
  const [newId, setNewId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPositive, setNewPositive] = useState(0.33);
  const [newNeutral, setNewNeutral] = useState(0.34);
  const [newNegative, setNewNegative] = useState(0.33);

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPositive, setEditPositive] = useState(0.33);
  const [editNeutral, setEditNeutral] = useState(0.34);
  const [editNegative, setEditNegative] = useState(0.33);

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    if (selectedId && archetypes.some((item) => item.id === selectedId)) return;
    if (archetypes.length > 0) {
      setSelectedId(archetypes[0].id);
    }
  }, [open, archetypes, selectedId]);

  useEffect(() => {
    setNewId(toSlug(newName));
  }, [newName]);

  const detailQuery = useQuery({
    queryKey: ['designer-v2', 'archetype-detail', selectedId],
    queryFn: () => getArchetype(selectedId),
    enabled: open && !!selectedId,
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    setEditName(detailQuery.data.name ?? '');
    setEditDescription(detailQuery.data.description ?? '');
    const weights = detailQuery.data.outcome_weights ?? {};
    setEditPositive(Number(weights.positive ?? 0.33));
    setEditNeutral(Number(weights.neutral ?? 0.34));
    setEditNegative(Number(weights.negative ?? 0.33));
  }, [detailQuery.data]);

  const normalizedCreateWeights = useMemo(() => {
    const p = Math.max(0, newPositive);
    const n = Math.max(0, newNeutral);
    const ng = Math.max(0, newNegative);
    const total = p + n + ng;
    if (total <= 0) return { positive: 0.33, neutral: 0.34, negative: 0.33 };
    return {
      positive: Number((p / total).toFixed(4)),
      neutral: Number((n / total).toFixed(4)),
      negative: Number((ng / total).toFixed(4)),
    };
  }, [newPositive, newNeutral, newNegative]);

  const normalizedEditWeights = useMemo(() => {
    const p = Math.max(0, editPositive);
    const n = Math.max(0, editNeutral);
    const ng = Math.max(0, editNegative);
    const total = p + n + ng;
    if (total <= 0) return { positive: 0.33, neutral: 0.34, negative: 0.33 };
    return {
      positive: Number((p / total).toFixed(4)),
      neutral: Number((n / total).toFixed(4)),
      negative: Number((ng / total).toFixed(4)),
    };
  }, [editPositive, editNeutral, editNegative]);

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!newFile) {
        throw new Error('Select a .txt file before generating.');
      }
      if (!newName.trim() || !newId.trim()) {
        throw new Error('Name and ID are required.');
      }
      return generateArchetype({
        file: newFile,
        id: newId.trim(),
        name: newName.trim(),
        description: newDescription.trim(),
        outcome_weights: normalizedCreateWeights,
      });
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['designer-v2', 'archetypes'] });
      onArchetypeSelected(data.id);
      setSelectedId(data.id);
      setStatusMessage(`Generated '${data.name}' with ${data.sample_count} samples.`);
      setErrorMessage('');
      setNewName('');
      setNewDescription('');
      setNewFile(null);
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate archetype');
      setStatusMessage('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('Select an archetype first.');
      if (!editName.trim()) throw new Error('Name cannot be empty.');
      return updateArchetype(selectedId, {
        name: editName.trim(),
        description: editDescription.trim(),
        outcome_weights: normalizedEditWeights,
      });
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['designer-v2', 'archetypes'] }),
        queryClient.invalidateQueries({ queryKey: ['designer-v2', 'archetype-detail', selectedId] }),
      ]);
      onArchetypeSelected(data.id);
      setStatusMessage(`Updated '${data.name}'.`);
      setErrorMessage('');
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update archetype');
      setStatusMessage('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Select an archetype first.');
      await deleteArchetype(selectedId);
      return selectedId;
    },
    onSuccess: async (deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ['designer-v2', 'archetypes'] });
      const remaining = archetypes.filter((item) => item.id !== deletedId);
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id);
        onArchetypeSelected(remaining[0].id);
      } else {
        setSelectedId('');
      }
      setStatusMessage(`Deleted '${deletedId}'.`);
      setErrorMessage('');
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete archetype');
      setStatusMessage('');
    },
  });

  const isBusy = generateMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogTitle>Manage Drift Archetypes</DialogTitle>
        <DialogDescription>
          Archetypes are global replay datasets used by Drift simulation.
        </DialogDescription>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-bg-tertiary/40 border border-white/10 rounded-xl p-3 space-y-2 max-h-[440px] overflow-auto">
            {archetypes.length === 0 ? (
              <div className="text-xs text-text-secondary">No archetypes found.</div>
            ) : (
              archetypes.map((item) => {
                const selected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      selected
                        ? 'border-accent bg-accent/10 text-text-primary'
                        : 'border-white/10 bg-bg-secondary/60 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs opacity-80">{item.id}</div>
                    <div className="text-[11px] opacity-70 mt-1">
                      {item.sample_count ?? 0} samples
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-bg-tertiary/40 border border-white/10 rounded-xl p-3 space-y-3">
              <h4 className="text-sm font-medium text-text-primary">Generate From File</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <input
                  value={newId}
                  onChange={(e) => setNewId(toSlug(e.target.value))}
                  placeholder="id-slug"
                  className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description"
                rows={2}
                className="w-full bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={newPositive}
                  onChange={(e) => setNewPositive(Number(e.target.value))}
                  className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm"
                  title="Positive outcome weight"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={newNeutral}
                  onChange={(e) => setNewNeutral(Number(e.target.value))}
                  className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm"
                  title="Neutral outcome weight"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={newNegative}
                  onChange={(e) => setNewNegative(Number(e.target.value))}
                  className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm"
                  title="Negative outcome weight"
                />
              </div>
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-text-secondary"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  disabled={isBusy || !newFile}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Generate
                </Button>
              </div>
            </div>

            <div className="bg-bg-tertiary/40 border border-white/10 rounded-xl p-3 space-y-3">
              <h4 className="text-sm font-medium text-text-primary">Edit Selected</h4>
              {!selectedId ? (
                <div className="text-xs text-text-secondary">Select an archetype to edit.</div>
              ) : detailQuery.isLoading ? (
                <div className="text-xs text-text-secondary flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading details...
                </div>
              ) : (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                    className="w-full bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    placeholder="Description"
                    className="w-full bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={editPositive}
                      onChange={(e) => setEditPositive(Number(e.target.value))}
                      className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm"
                      title="Positive outcome weight"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={editNeutral}
                      onChange={(e) => setEditNeutral(Number(e.target.value))}
                      className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm"
                      title="Neutral outcome weight"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={editNegative}
                      onChange={(e) => setEditNegative(Number(e.target.value))}
                      className="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm"
                      title="Negative outcome weight"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-text-secondary">
                      {detailQuery.data?.sample_count ?? 0} samples
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-error hover:text-error"
                        onClick={() => {
                          if (window.confirm(`Delete archetype '${selectedId}'?`)) {
                            deleteMutation.mutate();
                          }
                        }}
                        disabled={isBusy}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                      <Button size="sm" onClick={() => updateMutation.mutate()} disabled={isBusy}>
                        {updateMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {statusMessage && (
              <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                {statusMessage}
              </div>
            )}
            {errorMessage && (
              <div className="text-xs text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">
                {errorMessage}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ArchetypeManagerDialog;
