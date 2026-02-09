import { useCallback } from 'react';
import { Upload } from 'lucide-react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import { useAvatarDebug } from './AvatarDebugContext';

export function AudioFileTestSection() {
  const { rendererRef, audioRef, setLastAction } = useAvatarDebug();

  const getAudioDuration = (audio: HTMLAudioElement): Promise<number> => {
    return new Promise((resolve) => {
      if (audio.duration && !isNaN(audio.duration)) {
        resolve(audio.duration);
      } else {
        audio.onloadedmetadata = () => resolve(audio.duration);
      }
    });
  };

  const generateTestAlignment = (duration: number) => {
    const chars: string[] = [];
    const charStartTimesMs: number[] = [];
    const charDurationsMs: number[] = [];

    const vowels = 'aeiou';
    const consonants = 'bcdfghjklmnpqrstvwxyz';
    const intervalMs = 100;

    for (let t = 0; t < duration * 1000; t += intervalMs) {
      const isVowel = Math.random() > 0.5;
      const charSet = isVowel ? vowels : consonants;
      chars.push(charSet[Math.floor(Math.random() * charSet.length)]);
      charStartTimesMs.push(t);
      charDurationsMs.push(intervalMs);
    }

    return { chars, charStartTimesMs, charDurationsMs };
  };

  const handleAudioFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const renderer = rendererRef.current;

    if (!file || !renderer?.lipSyncEngine) {
      setLastAction('Error: Lip sync not ready');
      return;
    }

    try {
      setLastAction(`Loading: ${file.name}...`);

      const url = URL.createObjectURL(file);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      const duration = await getAudioDuration(audio);
      const alignment = generateTestAlignment(duration);

      renderer.lipSyncEngine.setAlignment(alignment);
      renderer.lipSyncEngine.startSync(audio);

      audio.onended = () => {
        renderer.lipSyncEngine?.stop();
        URL.revokeObjectURL(url);
        setLastAction('Audio finished');
      };

      await audio.play();
      setLastAction(`Playing: ${file.name} (${duration.toFixed(1)}s)`);
    } catch (err) {
      setLastAction(`Error: ${err}`);
    }
  }, [rendererRef, audioRef, setLastAction]);

  return (
    <AccordionItem value="audio-file" className="border-white/10">
      <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
        Audio File Test
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <label className="flex items-center justify-center gap-2 bg-bg-tertiary/70 border border-dashed border-white/10 rounded-lg p-3 cursor-pointer hover:bg-bg-secondary transition-colors">
            <Upload className="w-4 h-4" />
            <span className="text-sm">Upload MP3/WAV</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioFile}
              className="hidden"
            />
          </label>
          <p className="text-xs text-text-secondary">
            Uses random visemes (for testing without API)
          </p>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
