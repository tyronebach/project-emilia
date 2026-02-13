import { useState, useEffect } from 'react';
import { X, Sliders, Sparkles, Video, Volume2, VolumeX } from 'lucide-react';
import { useAppStore } from '../store';
import { useUserStore } from '../store/userStore';
import { useRenderStore, QUALITY_LABELS } from '../store/renderStore';
import { updateUserPreferences } from '../utils/api';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { getPreset, type QualityPreset } from '../avatar/QualityPresets';

interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function UserSettingsModal({ open, onClose }: UserSettingsModalProps) {
  const currentUser = useUserStore((state) => state.currentUser);
  const updatePreferences = useUserStore((state) => state.updatePreferences);
  const ttsEnabled = useAppStore((state) => state.ttsEnabled);
  const setTtsEnabled = useAppStore((state) => state.setTtsEnabled);
  const avatarRenderer = useAppStore((state) => state.avatarRenderer);
  
  // Render quality
  const renderPreset = useRenderStore((state) => state.preset);
  const setRenderPreset = useRenderStore((state) => state.setPreset);
  
  // Camera controls
  const cameraDriftEnabled = useRenderStore((state) => state.cameraDriftEnabled);
  const setCameraDriftEnabled = useRenderStore((state) => state.setCameraDriftEnabled);
  
  // Avatar behavior
  const lookAtEnabled = useRenderStore((state) => state.lookAtEnabled);
  const setLookAtEnabled = useRenderStore((state) => state.setLookAtEnabled);

  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<'tts_enabled' | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!currentUser?.preferences) {
      setTtsEnabled(false);
      return;
    }
    try {
      const parsed = JSON.parse(currentUser.preferences);
      setTtsEnabled(Boolean(parsed?.tts_enabled));
    } catch {
      setTtsEnabled(false);
    }
  }, [open, currentUser?.preferences, setTtsEnabled]);

  // Handle render quality change
  const handleRenderQualityChange = (preset: QualityPreset) => {
    setRenderPreset(preset);
    // Apply to renderer if available
    if (avatarRenderer) {
      avatarRenderer.applyQualitySettings(getPreset(preset));
    }
  };

  const handleToggle = async (
    key: 'tts_enabled',
    enabled: boolean,
    setter: (v: boolean) => void,
    previous: boolean
  ) => {
    if (!currentUser) {
      setError('No user selected');
      return;
    }

    setError(null);
    setSavingKey(key);
    setter(enabled);

    try {
      const updated = await updateUserPreferences(currentUser.id, { [key]: enabled });
      if (updated?.preferences) {
        updatePreferences(updated.preferences);
      }
    } catch (err) {
      setter(previous);
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-96 max-w-[92vw] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent" />
            <DialogTitle>User Settings</DialogTitle>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <X className="w-3 h-3" />
            </Button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          Manage default user preferences like voice replies.
        </DialogDescription>

        {error && (
          <div className="mb-3 p-2 text-xs text-error bg-error/10 border border-error/30 rounded">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-text-primary">Voice</div>
            <div className="text-[11px] text-text-secondary">
              Defaults for speech synthesis.
            </div>
          </div>

          <button
            onClick={() => 
              handleToggle('tts_enabled', !ttsEnabled, setTtsEnabled, ttsEnabled)
            }
            disabled={!currentUser || savingKey === 'tts_enabled'}
            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              ttsEnabled
                ? 'bg-accent/15 border-accent/40 text-text-primary'
                : 'bg-bg-tertiary/50 border-white/10 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`relative p-2 rounded-lg transition-all duration-200 ${
                ttsEnabled 
                  ? 'bg-accent/20 text-accent' 
                  : 'bg-bg-secondary text-text-secondary'
              }`}>
                {ttsEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
                {ttsEnabled && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Voice replies (TTS)</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full ${
                    savingKey === 'tts_enabled'
                      ? 'bg-warning/20 text-warning animate-pulse'
                      : ttsEnabled 
                        ? 'bg-accent/20 text-accent' 
                        : 'bg-bg-secondary text-text-secondary'
                  }`}>
                    {savingKey === 'tts_enabled' ? 'SAVING...' : ttsEnabled ? 'ON' : 'OFF'}
                  </div>
                </div>
                <div className="text-xs text-text-secondary mt-0.5">
                  Enables spoken responses by default.
                </div>
              </div>
            </div>
          </button>

          {!currentUser && (
            <div className="text-xs text-text-secondary">
              Select a user before changing settings.
            </div>
          )}

          {/* Render Quality Section */}
          <div className="pt-4 border-t border-white/10 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <div className="text-xs font-semibold text-text-primary">Graphics Quality</div>
            </div>
            <div className="text-[11px] text-text-secondary mb-3">
              Adjust avatar rendering quality.
            </div>

            <div className="space-y-2">
              {(['low', 'medium', 'high'] as QualityPreset[]).map((preset) => {
                const label = QUALITY_LABELS[preset];
                const isSelected = renderPreset === preset;
                
                return (
                  <button
                    key={preset}
                    onClick={() => handleRenderQualityChange(preset)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-accent/15 border-accent/40 text-text-primary'
                        : 'bg-bg-tertiary/50 border-white/10 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label.name}</span>
                      {isSelected && (
                        <span className="text-xs text-accent">✓</span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {label.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Camera Controls Section */}
          <div className="pt-4 border-t border-white/10 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Video className="w-4 h-4 text-accent" />
              <div className="text-xs font-semibold text-text-primary">Camera Controls</div>
            </div>
            <div className="text-[11px] text-text-secondary mb-3">
              Adjust camera behavior.
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-accent"
                checked={cameraDriftEnabled}
                onChange={(e) => setCameraDriftEnabled(e.target.checked)}
              />
              <div>
                <div className="text-sm text-text-primary">Auto-reset camera</div>
                <div className="text-xs text-text-secondary">
                  Camera drifts back to home position after inactivity.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer mt-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-accent"
                checked={lookAtEnabled}
                onChange={(e) => {
                  setLookAtEnabled(e.target.checked);
                  // Apply immediately to renderer
                  if (avatarRenderer) {
                    avatarRenderer.setLookAtEnabled(e.target.checked);
                  }
                }}
              />
              <div>
                <div className="text-sm text-text-primary">Eye & head follow</div>
                <div className="text-xs text-text-secondary">
                  Avatar looks toward the camera.
                </div>
              </div>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UserSettingsModal;
