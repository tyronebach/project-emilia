import { useEffect, useState } from 'react';

export type VoiceOption = {
  id: string;
  name: string;
};

const VOICE_MANIFEST_PATH = '/vrm/voice-ids.json';

export function useVoiceOptions() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadVoices = async () => {
      try {
        const response = await fetch(VOICE_MANIFEST_PATH, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Voice manifest request failed: ${response.status}`);
        }

        const manifest = await response.json();
        if (!Array.isArray(manifest)) {
          throw new Error('Voice manifest is not an array');
        }

        const options = manifest
          .filter((item) => item && typeof item.id === 'string')
          .map((item) => ({
            id: item.id,
            name: typeof item.name === 'string' ? item.name : item.id,
          }));

        if (!isActive) return;
        setVoices(options);
      } catch (err) {
        console.warn('[useVoiceOptions] Failed to load voice manifest:', err);
        if (!isActive) return;
        setVoices([]);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadVoices();

    return () => {
      isActive = false;
    };
  }, []);

  return { voices, loading };
}

export default useVoiceOptions;
