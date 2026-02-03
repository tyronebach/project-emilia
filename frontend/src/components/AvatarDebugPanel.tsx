/**
 * Avatar Debug Panel
 * Test VRM models, animations, expressions, and lip sync
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Play, Upload, Volume2, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { AvatarRenderer } from '../avatar/AvatarRenderer';
import type { VRM } from '@pixiv/three-vrm';

// Available VRM models (add more as needed)
const AVAILABLE_MODELS = [
  { id: 'emilia.vrm', name: 'Emilia' },
  { id: 'emilia-v2.vrm', name: 'Emilia V2' },
];

// Animations registered in AnimationLibrary
const AVAILABLE_ANIMATIONS = [
  'nod',
  'wave',
  'thinking',
  'surprised',
  'head_shake',
];

// Moods/expressions available
const AVAILABLE_MOODS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'thinking',
  'excited',
  'confused',
  'embarrassed',
  'smug',
];

function AvatarDebugPanel() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // State
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [currentMood, setCurrentMood] = useState('neutral');
  const [moodStrength, setMoodStrength] = useState(0.7);
  const [lastAction, setLastAction] = useState<string>('Initializing...');
  const [audioUrl, setAudioUrl] = useState('');
  const [loading, setLoading] = useState(true);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl: `/${selectedModel}`,
      onLoad: (vrm: VRM) => {
        const metaName = (vrm.meta as { name?: string })?.name;
        setLastAction(`Loaded: ${metaName || selectedModel}`);
        setLoading(false);
      },
      onError: (err: Error) => {
        setLastAction(`Error: ${err.message}`);
        setLoading(false);
      },
    });

    renderer.init();
    renderer.loadVRM();
    renderer.startRenderLoop();
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle model switch
  const switchModel = useCallback(async (modelId: string) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    setLoading(true);
    setLastAction(`Loading ${modelId}...`);
    setSelectedModel(modelId);

    try {
      const vrm = await renderer.loadVRM(`/${modelId}`);
      const metaName = (vrm.meta as { name?: string })?.name;
      setLastAction(`Loaded: ${metaName || modelId}`);
    } catch (err) {
      setLastAction(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Play animation
  const playAnimation = useCallback((name: string) => {
    const renderer = rendererRef.current;
    if (!renderer?.animationPlayer) {
      setLastAction('Error: Animation player not ready');
      return;
    }
    
    renderer.animationPlayer.play(name);
    setLastAction(`Animation: ${name}`);
  }, []);

  // Set mood
  const applyMood = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer?.expressionController) {
      setLastAction('Error: Expression controller not ready');
      return;
    }

    renderer.expressionController.setMood(currentMood, moodStrength);
    setLastAction(`Mood: ${currentMood} @ ${(moodStrength * 100).toFixed(0)}%`);
  }, [currentMood, moodStrength]);

  // Test lip sync with audio file
  const handleAudioFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const renderer = rendererRef.current;
    
    if (!file || !renderer?.lipSyncEngine) {
      setLastAction('Error: Lip sync not ready');
      return;
    }

    try {
      setLastAction(`Loading: ${file.name}...`);
      
      // Create blob URL
      const url = URL.createObjectURL(file);
      
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Create audio element
      const audio = new Audio(url);
      audioRef.current = audio;
      
      // Generate test alignment data (simulated visemes)
      const duration = await getAudioDuration(audio);
      const alignment = generateTestAlignment(duration);
      
      // Set up lip sync
      renderer.lipSyncEngine.setAlignment(alignment);
      renderer.lipSyncEngine.startSync(audio);
      
      // Play audio
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
  }, []);

  // Get audio duration
  const getAudioDuration = (audio: HTMLAudioElement): Promise<number> => {
    return new Promise((resolve) => {
      if (audio.duration && !isNaN(audio.duration)) {
        resolve(audio.duration);
      } else {
        audio.onloadedmetadata = () => resolve(audio.duration);
      }
    });
  };

  // Generate test alignment data (matches AlignmentData interface)
  const generateTestAlignment = (duration: number) => {
    const chars: string[] = [];
    const charStartTimesMs: number[] = [];
    const charDurationsMs: number[] = [];
    
    const vowels = 'aeiou';
    const consonants = 'bcdfghjklmnpqrstvwxyz';
    const intervalMs = 100; // 100ms per character
    
    for (let t = 0; t < duration * 1000; t += intervalMs) {
      const isVowel = Math.random() > 0.5;
      const charSet = isVowel ? vowels : consonants;
      chars.push(charSet[Math.floor(Math.random() * charSet.length)]);
      charStartTimesMs.push(t);
      charDurationsMs.push(intervalMs);
    }
    
    return { chars, charStartTimesMs, charDurationsMs };
  };

  // Test with URL
  const playAudioUrl = useCallback(async () => {
    const renderer = rendererRef.current;
    
    if (!audioUrl || !renderer?.lipSyncEngine) {
      setLastAction('Error: Need URL and lip sync ready');
      return;
    }
    
    try {
      setLastAction('Fetching audio...');
      
      // Stop existing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      const duration = await getAudioDuration(audio);
      const alignment = generateTestAlignment(duration);
      
      renderer.lipSyncEngine.setAlignment(alignment);
      renderer.lipSyncEngine.startSync(audio);
      
      audio.onended = () => {
        renderer.lipSyncEngine?.stop();
        setLastAction('Audio finished');
      };
      
      await audio.play();
      setLastAction(`Playing URL (${duration.toFixed(1)}s)`);
    } catch (err) {
      setLastAction(`Error: ${err}`);
    }
  }, [audioUrl]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    const renderer = rendererRef.current;
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    renderer?.lipSyncEngine?.stop();
    setLastAction('Stopped');
  }, []);

  // Quick combo
  const waveHappy = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    
    renderer.expressionController?.setMood('happy', 0.8);
    renderer.animationPlayer?.play('wave');
    setLastAction('Wave + Happy');
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-bg-tertiary shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/settings' })}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Avatar Debug Panel</h1>
        <span className="ml-auto text-xs text-text-secondary bg-bg-tertiary px-2 py-1 rounded max-w-[200px] truncate">
          {lastAction}
        </span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Avatar Viewport */}
        <div className="flex-1 min-h-[350px] lg:min-h-0 bg-bg-secondary relative">
          <div ref={containerRef} className="w-full h-full" />
          
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
              <RefreshCw className="w-8 h-8 animate-spin text-accent" />
            </div>
          )}
          
          {/* Model selector overlay */}
          <div className="absolute top-4 left-4 bg-bg-primary/90 backdrop-blur rounded-lg p-2">
            <select
              value={selectedModel}
              onChange={(e) => switchModel(e.target.value)}
              className="bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1 text-sm"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-bg-tertiary overflow-y-auto shrink-0">
          {/* Animations Section */}
          <section className="p-4 border-b border-bg-tertiary">
            <h2 className="text-sm font-semibold mb-3 text-text-secondary uppercase tracking-wide">
              Animations
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_ANIMATIONS.map((anim) => (
                <Button
                  key={anim}
                  variant="ghost"
                  size="sm"
                  onClick={() => playAnimation(anim)}
                  className="justify-start text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
                >
                  <Play className="w-3 h-3 mr-1" />
                  {anim}
                </Button>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-2">
              GLB files → /public/animations/
            </p>
          </section>

          {/* Expressions Section */}
          <section className="p-4 border-b border-bg-tertiary">
            <h2 className="text-sm font-semibold mb-3 text-text-secondary uppercase tracking-wide">
              Mood / Expression
            </h2>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary">Mood</label>
                <select
                  value={currentMood}
                  onChange={(e) => setCurrentMood(e.target.value)}
                  className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm mt-1"
                >
                  {AVAILABLE_MOODS.map((mood) => (
                    <option key={mood} value={mood}>{mood}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-xs text-text-secondary">
                  Strength: {(moodStrength * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={moodStrength}
                  onChange={(e) => setMoodStrength(parseFloat(e.target.value))}
                  className="w-full mt-1"
                />
              </div>
              
              <Button 
                onClick={applyMood} 
                size="sm" 
                className="w-full bg-accent text-white hover:bg-accent-hover"
              >
                Apply Mood
              </Button>
            </div>
          </section>

          {/* Lip Sync Section */}
          <section className="p-4 border-b border-bg-tertiary">
            <h2 className="text-sm font-semibold mb-3 text-text-secondary uppercase tracking-wide">
              Lip Sync Test
            </h2>
            
            <div className="space-y-3">
              {/* File upload */}
              <div>
                <label className="text-xs text-text-secondary">Audio File</label>
                <div className="mt-1">
                  <label className="flex items-center justify-center gap-2 bg-bg-tertiary border border-dashed border-text-secondary/30 rounded-lg p-3 cursor-pointer hover:bg-bg-secondary transition-colors">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">Upload MP3/WAV</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              
              {/* URL input */}
              <div>
                <label className="text-xs text-text-secondary">Or Audio URL</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm"
                  />
                  <Button 
                    size="sm" 
                    onClick={playAudioUrl} 
                    disabled={!audioUrl}
                    className="bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Volume2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={stopSpeaking} 
                className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
              >
                Stop Speaking
              </Button>
              
              <p className="text-xs text-text-secondary">
                Uses random test visemes. Real ones from ElevenLabs.
              </p>
            </div>
          </section>

          {/* Quick Actions */}
          <section className="p-4">
            <h2 className="text-sm font-semibold mb-3 text-text-secondary uppercase tracking-wide">
              Quick Actions
            </h2>
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
                onClick={() => {
                  rendererRef.current?.expressionController?.setMood('happy', 1.0);
                  setLastAction('Max Happy');
                }}
              >
                😊 Max Happy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
                onClick={() => {
                  rendererRef.current?.expressionController?.setMood('neutral', 0);
                  setLastAction('Reset Neutral');
                }}
              >
                😐 Reset to Neutral
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
                onClick={waveHappy}
              >
                👋 Wave + Happy
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default AvatarDebugPanel;
