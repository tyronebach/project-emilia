import { useState, useEffect } from 'react';
import { X, Sliders } from 'lucide-react';
import { useAppStore } from '../store';
import { useUserStore } from '../store/userStore';
import { updateUserPreferences } from '../utils/api';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function UserSettingsModal({ open, onClose }: UserSettingsModalProps) {
  const currentUser = useUserStore((state) => state.currentUser);
  const updatePreferences = useUserStore((state) => state.updatePreferences);
  const ttsEnabled = useAppStore((state) => state.ttsEnabled);
  const setTtsEnabled = useAppStore((state) => state.setTtsEnabled);

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

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-accent"
              checked={ttsEnabled}
              disabled={!currentUser || savingKey === 'tts_enabled'}
              onChange={(e) =>
                handleToggle('tts_enabled', e.target.checked, setTtsEnabled, ttsEnabled)
              }
            />
            <div>
            <div className="text-sm text-text-primary">Voice replies (TTS)</div>
            <div className="text-xs text-text-secondary">
              Enables spoken responses by default.
            </div>
          </div>
        </label>

          {!currentUser && (
            <div className="text-xs text-text-secondary">
              Select a user before changing settings.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UserSettingsModal;
