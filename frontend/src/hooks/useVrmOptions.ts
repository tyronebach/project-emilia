import { useEffect, useState } from 'react';

export type VrmOption = {
  id: string;
  name: string;
  version?: string;
  voiceId?: string;
};

const VRM_MANIFEST_PATH = '/vrm/vrm-manifest.json';

export function useVrmOptions() {
  const [models, setModels] = useState<VrmOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadModels = async () => {
      try {
        const response = await fetch(VRM_MANIFEST_PATH, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`VRM manifest request failed: ${response.status}`);
        }

        const manifest = await response.json();
        if (!Array.isArray(manifest)) {
          throw new Error('VRM manifest is not an array');
        }

        const options = manifest
          .filter((item) => item && typeof item.id === 'string')
          .map((item) => ({
            id: item.id,
            name: typeof item.name === 'string' ? item.name : item.id,
            version: typeof item.version === 'string' ? item.version : undefined,
            voiceId: typeof item.voiceId === 'string' ? item.voiceId : undefined,
          }));

        if (!isActive) return;
        setModels(options);
      } catch (err) {
        console.warn('[useVrmOptions] Failed to load VRM manifest:', err);
        if (!isActive) return;
        setModels([]);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadModels();

    return () => {
      isActive = false;
    };
  }, []);

  return { models, loading };
}

export default useVrmOptions;
