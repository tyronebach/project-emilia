import { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw, Mic } from 'lucide-react';
import { Button } from '../../ui/button';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import { fetchWithAuth } from '../../../utils/api';
import { useVoiceOptions } from '../../../hooks/useVoiceOptions';
import { useAppStore } from '../../../store';
import { useAvatarDebug } from './AvatarDebugContext';

export function TtsElevenLabsSection() {
  const { rendererRef, audioRef, setLastAction } = useAvatarDebug();
  const voiceId = useAppStore((s) => s.ttsVoiceId);
  const setVoiceId = useAppStore((s) => s.setTtsVoiceId);

  const [ttsText, setTtsText] = useState('Welcome back~ I missed you while you were away. Is there anything I can help you with today?');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [alignmentData, setAlignmentData] = useState<{ chars: string[]; charStartTimesMs: number[]; charDurationsMs: number[] } | null>(null);
  const { voices: voiceOptions, loading: voicesLoading } = useVoiceOptions();

  const [actualDurationMs, setActualDurationMs] = useState<number | null>(null);
  const [predictedDurationMs, setPredictedDurationMs] = useState<number | null>(null);
  const [enableScaling, setEnableScaling] = useState(true);
  const [currentPlaybackMs, setCurrentPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIntervalRef = useRef<number | null>(null);

  const [lipSyncWeightMultiplier, setLipSyncWeightMultiplier] = useState(1.0);
  const [lipSyncBlendSpeed, setLipSyncBlendSpeed] = useState(0.3);
  const [lipSyncMinHoldMs, setLipSyncMinHoldMs] = useState(50);

  // Sync lip sync config to engine when values change
  useEffect(() => {
    const engine = rendererRef.current?.lipSyncEngine;
    if (engine) {
      engine.setConfig({
        weightMultiplier: lipSyncWeightMultiplier,
        blendSpeed: lipSyncBlendSpeed,
        minHoldMs: lipSyncMinHoldMs,
      });
    }
  }, [lipSyncWeightMultiplier, lipSyncBlendSpeed, lipSyncMinHoldMs, rendererRef]);

  const stopSpeaking = useCallback(() => {
    const renderer = rendererRef.current;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }

    renderer?.lipSyncEngine?.stop();
    setIsPlaying(false);
    setLastAction('Stopped');
  }, [rendererRef, audioRef, setLastAction]);

  const testTTS = useCallback(async () => {
    const renderer = rendererRef.current;
    if (!renderer?.lipSyncEngine) {
      setLastAction('Error: Lip sync not ready');
      return;
    }

    if (!ttsText.trim()) {
      setLastAction('Error: Enter text to speak');
      return;
    }

    setTtsLoading(true);
    setIsPlaying(false);
    setCurrentPlaybackMs(0);
    setActualDurationMs(null);
    setPredictedDurationMs(null);
    setLastAction('Calling ElevenLabs...');

    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        renderer.lipSyncEngine.stop();
      }

      const response = await fetchWithAuth('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsText.trim(),
          voice_id: voiceId.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'TTS failed');
      }

      const result = await response.json();

      const audioData = atob(result.audio_base64);
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i);
      }
      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      await new Promise<void>((resolve) => {
        if (audio.duration && !isNaN(audio.duration)) {
          resolve();
        } else {
          audio.onloadedmetadata = () => resolve();
        }
      });

      const actualMs = audio.duration * 1000;
      setActualDurationMs(actualMs);

      if (result.alignment) {
        console.log('[Debug] ElevenLabs alignment:', result.alignment);

        const { charStartTimesMs, charDurationsMs } = result.alignment;
        if (charStartTimesMs?.length) {
          const lastIdx = charStartTimesMs.length - 1;
          const predicted = charStartTimesMs[lastIdx] + (charDurationsMs[lastIdx] || 0);
          setPredictedDurationMs(predicted);
        }

        setAlignmentData(result.alignment);

        const audioDurationMs = enableScaling ? actualMs : undefined;
        renderer.lipSyncEngine.setAlignment(result.alignment, audioDurationMs);
        renderer.lipSyncEngine.startSync(audio);
        setLastAction(`TTS: ${result.alignment.chars?.length || 0} chars, ${(actualMs/1000).toFixed(2)}s`);
      } else {
        console.log('[Debug] No alignment data in response');
        setAlignmentData(null);
        setLastAction(`TTS: NO ALIGNMENT DATA`);
      }

      setIsPlaying(true);
      playbackIntervalRef.current = window.setInterval(() => {
        if (audioRef.current) {
          setCurrentPlaybackMs(audioRef.current.currentTime * 1000);
        }
      }, 50);

      audio.onended = () => {
        renderer.lipSyncEngine?.stop();
        URL.revokeObjectURL(audioUrl);
        setLastAction('TTS finished');
        setIsPlaying(false);
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      };

      await audio.play();
    } catch (err) {
      setLastAction(`TTS Error: ${err}`);
      setIsPlaying(false);
    } finally {
      setTtsLoading(false);
    }
  }, [ttsText, voiceId, enableScaling, rendererRef, audioRef, setLastAction]);

  return (
    <AccordionItem value="tts" className="border-white/10">
      <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
        TTS (ElevenLabs)
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary">Text to Speak</label>
            <textarea
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              placeholder="Enter text..."
              rows={3}
              className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1.5 text-sm mt-1 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">Voice (ElevenLabs)</label>
            <select
              value={voiceId || ''}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1.5 text-sm mt-1 focus:border-accent focus:outline-none"
            >
              <option value="">
                {voicesLoading ? 'Loading voices...' : 'Default'}
              </option>
              {!voicesLoading && voiceId && !voiceOptions.some((voice) => voice.id === voiceId) && (
                <option value={voiceId}>
                  Custom ({voiceId})
                </option>
              )}
              {voiceOptions.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.id})
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={testTTS}
            disabled={ttsLoading || !ttsText.trim()}
            size="sm"
            className="w-full bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {ttsLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                Speak (Real Visemes)
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={stopSpeaking}
            className="w-full text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
          >
            Stop
          </Button>

          {/* Timestamp Scaling Toggle */}
          <div className="flex items-center gap-2 p-2 bg-bg-tertiary/80 border border-white/10 rounded">
            <input
              type="checkbox"
              id="enableScaling"
              checked={enableScaling}
              onChange={(e) => setEnableScaling(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <label htmlFor="enableScaling" className="text-xs text-text-secondary cursor-pointer">
              Scale timestamps to actual audio duration
            </label>
          </div>

          {/* Lip Sync Tuning */}
          <div className="p-2 bg-bg-tertiary/80 border border-white/10 rounded space-y-3">
            <div className="text-xs text-text-secondary font-semibold">🎚️ Lip Sync Tuning</div>

            <div>
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>Volume Multiplier</span>
                <span className="text-accent">{lipSyncWeightMultiplier.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={lipSyncWeightMultiplier}
                onChange={(e) => setLipSyncWeightMultiplier(parseFloat(e.target.value))}
                className="w-full h-2 accent-accent"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>Blend Speed (smoothing)</span>
                <span className="text-accent">{lipSyncBlendSpeed.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.01"
                value={lipSyncBlendSpeed}
                onChange={(e) => setLipSyncBlendSpeed(parseFloat(e.target.value))}
                className="w-full h-2 accent-accent"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>Min Hold (anti-flicker)</span>
                <span className="text-accent">{lipSyncMinHoldMs}ms</span>
              </div>
              <input
                type="range"
                min="0"
                max="150"
                step="10"
                value={lipSyncMinHoldMs}
                onChange={(e) => setLipSyncMinHoldMs(parseInt(e.target.value))}
                className="w-full h-2 accent-accent"
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLipSyncWeightMultiplier(1.0);
                setLipSyncBlendSpeed(0.3);
                setLipSyncMinHoldMs(50);
              }}
              className="w-full text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60"
            >
              Reset to Defaults
            </Button>
          </div>

          {/* Timing Analysis Display */}
          <div className="p-2 bg-bg-tertiary/80 border border-white/10 rounded text-xs font-mono space-y-2">
            <div className="text-text-secondary font-semibold">⏱️ Timing Analysis:</div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-text-secondary">Predicted: </span>
                <span className={predictedDurationMs ? 'text-warning' : 'text-text-secondary/50'}>
                  {predictedDurationMs ? `${(predictedDurationMs/1000).toFixed(2)}s` : '—'}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Actual: </span>
                <span className={actualDurationMs ? 'text-success' : 'text-text-secondary/50'}>
                  {actualDurationMs ? `${(actualDurationMs/1000).toFixed(2)}s` : '—'}
                </span>
              </div>
            </div>

            {predictedDurationMs && actualDurationMs && (
              <div className={`text-xs ${Math.abs(predictedDurationMs - actualDurationMs) > 200 ? 'text-error' : 'text-success'}`}>
                {(() => {
                  const diff = actualDurationMs - predictedDurationMs;
                  const percent = ((diff / predictedDurationMs) * 100).toFixed(1);
                  const scale = (actualDurationMs / predictedDurationMs).toFixed(3);
                  return `Δ ${diff > 0 ? '+' : ''}${(diff/1000).toFixed(2)}s (${diff > 0 ? '+' : ''}${percent}%) → scale: ${scale}x`;
                })()}
              </div>
            )}

            {isPlaying && actualDurationMs && (
              <div className="space-y-1">
                <div className="flex justify-between text-text-secondary">
                  <span>Playback:</span>
                  <span>{(currentPlaybackMs/1000).toFixed(2)}s / {(actualDurationMs/1000).toFixed(2)}s</span>
                </div>
                <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-100"
                    style={{ width: `${(currentPlaybackMs / actualDurationMs) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Alignment Data Display */}
          <div className="p-2 bg-bg-tertiary/80 border border-white/10 rounded text-xs font-mono">
            <div className="text-text-secondary mb-1">Alignment Data:</div>
            {alignmentData ? (
              <div className="space-y-1">
                <div className="text-success">✓ {alignmentData.chars?.length || 0} characters</div>
                <div className="text-text-secondary overflow-hidden">
                  chars: {alignmentData.chars?.slice(0, 30).join('') || 'none'}...
                </div>
                <div className="text-text-secondary">
                  times: [{alignmentData.charStartTimesMs?.slice(0, 5).join(', ')}...]
                </div>
                <div className="text-text-secondary">
                  last: {alignmentData.charStartTimesMs?.[alignmentData.charStartTimesMs.length - 1]}ms
                </div>
              </div>
            ) : (
              <div className="text-error">✗ No alignment data</div>
            )}
          </div>

          <div className="text-xs text-text-secondary/70 p-2 bg-warning/10 rounded border border-warning/30">
            <strong>Known Issue:</strong> ElevenLabs timing is estimated, not measured from audio.
            Enable scaling to adjust timestamps to actual audio duration.
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
