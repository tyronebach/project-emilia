/**
 * Avatar Debug Panel
 * Test VRM models, animations, expressions, and lip sync
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Play, Upload, RefreshCw, Mic, FileUp, Volume2, Sliders, Bug, Gauge } from 'lucide-react';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { VoiceIndicator } from './VoiceIndicator';
import { VoiceToggle } from './VoiceToggle';
import { VoiceDebugTimeline, type VoiceDebugEntry } from './VoiceDebugTimeline';
import { Button } from './ui/button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { AvatarRenderer, QUALITY_PRESETS, getPreset, type QualityPreset, type QualitySettings } from '../avatar';
import { fetchWithAuth } from '../utils/api';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import { useVrmOptions, type VrmOption } from '../hooks/useVrmOptions';
import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retargetAnimation } from 'vrm-mixamo-retarget';
import { VRMAnimationLoaderPlugin, VRMAnimation, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import AppTopNav from './AppTopNav';

const VRM_BASE_PATH = '/vrm';

// Fallback models if manifest fails to load
const DEFAULT_MODELS: VrmOption[] = [
  { id: 'emilia.vrm', name: 'Emilia' },
  { id: 'rem.vrm', name: 'Rem' },
];

const buildVrmUrl = (modelId: string) => `${VRM_BASE_PATH}/${modelId}`;

// Animations registered in AnimationLibrary
const AVAILABLE_ANIMATIONS = [
  'test_wave',  // Procedural test - no file needed
  'hip_hop',    // Mixamo - should work!
  'wave',
  'bow',
  'nod',
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
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0].id);
  const [currentMood, setCurrentMood] = useState('neutral');
  const [moodStrength, setMoodStrength] = useState(0.7);
  const [lastAction, setLastAction] = useState<string>('Initializing...');
  const [loading, setLoading] = useState(true);
  
  // TTS testing state
  const [ttsText, setTtsText] = useState('Welcome back~ I missed you while you were away. Is there anything I can help you with today?');
  const [voiceId, setVoiceId] = useState('gNLojYp5VOiuqC8CTCmi');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [alignmentData, setAlignmentData] = useState<{ chars: string[]; charStartTimesMs: number[]; charDurationsMs: number[] } | null>(null);
  const { voices: voiceOptions, loading: voicesLoading } = useVoiceOptions();
  const { models: vrmOptions } = useVrmOptions();
  const availableModels = vrmOptions.length ? vrmOptions : DEFAULT_MODELS;
  
  // Lip sync timing analysis state
  const [actualDurationMs, setActualDurationMs] = useState<number | null>(null);
  const [predictedDurationMs, setPredictedDurationMs] = useState<number | null>(null);
  const [enableScaling, setEnableScaling] = useState(true);
  const [currentPlaybackMs, setCurrentPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIntervalRef = useRef<number | null>(null);
  
  // Lip sync config (tunable parameters)
  const [lipSyncWeightMultiplier, setLipSyncWeightMultiplier] = useState(1.0);
  const [lipSyncBlendSpeed, setLipSyncBlendSpeed] = useState(0.3);
  const [lipSyncMinHoldMs, setLipSyncMinHoldMs] = useState(50);
  
  // FBX retarget test state
  const [fbxStatus, setFbxStatus] = useState<string>('Upload Mixamo FBX');
  const [glbStatus, setGlbStatus] = useState<string>('Upload GLB Animation');
  const fbxMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const fbxActionRef = useRef<THREE.AnimationAction | null>(null);
  
  // Voice chat state
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [voiceDebugEvents, setVoiceDebugEvents] = useState<VoiceDebugEntry[]>([]);
  const voiceEnabledRef = useRef<boolean | null>(null);

  // Render quality state
  const [qualityPreset, setQualityPreset] = useState<QualityPreset | 'custom'>('medium');
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>(getPreset('medium'));
  const [fps, setFps] = useState<number>(0);
  const fpsFramesRef = useRef<number[]>([]);
  const lastFpsUpdateRef = useRef<number>(0);

  // LookAt state
  const [lookAtEnabled, setLookAtEnabled] = useState(true);
  const [lookAtMaxAngle, setLookAtMaxAngle] = useState(35);
  const [lookAtEyeWeight, setLookAtEyeWeight] = useState(1.0);
  const [lookAtHeadWeight, setLookAtHeadWeight] = useState(0.25);

  const MAX_VOICE_DEBUG_EVENTS = 80;

  const addVoiceDebugEvent = useCallback((event: VoiceDebugEntry['event']) => {
    const time = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setVoiceDebugEvents((prev) => {
      const next = [...prev, { id, time, event }];
      return next.slice(-MAX_VOICE_DEBUG_EVENTS);
    });
  }, []);

  const clearVoiceDebugEvents = useCallback(() => {
    setVoiceDebugEvents([]);
  }, []);

  const voiceChat = useVoiceChat({
    onTranscript: (text) => {
      setVoiceTranscript(text);
      setLastAction(`Voice: "${text.slice(0, 30)}..."`);
      console.log('[Voice] Transcript:', text);
      // In real app, this would send to /api/chat
    },
    onError: (error) => {
      setLastAction(`Voice Error: ${error.message}`);
    },
    onDebugEvent: addVoiceDebugEvent,
    silenceTimeout: 15000, // 15s before returning to passive
    autoResumeAfterTranscript: true,
  });

  useEffect(() => {
    if (voiceEnabledRef.current === null) {
      voiceEnabledRef.current = voiceChat.isEnabled;
      return;
    }
    if (voiceEnabledRef.current !== voiceChat.isEnabled) {
      clearVoiceDebugEvents();
      voiceEnabledRef.current = voiceChat.isEnabled;
    }
  }, [voiceChat.isEnabled, clearVoiceDebugEvents]);

  // Handle model switch
  const switchModel = useCallback(async (modelId: string) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    setLoading(true);
    setLastAction(`Loading ${modelId}...`);
    setSelectedModel(modelId);

    try {
      const vrm = await renderer.loadVRM(buildVrmUrl(modelId));
      const metaName = (vrm.meta as { name?: string })?.name;
      setLastAction(`Loaded: ${metaName || modelId}`);
    } catch (err) {
      setLastAction(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (availableModels.some((model) => model.id === selectedModel)) return;
    const fallback = availableModels[0]?.id;
    if (!fallback) return;
    setSelectedModel(fallback);
    if (rendererRef.current) {
      switchModel(fallback);
    }
  }, [availableModels, selectedModel, switchModel]);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl: buildVrmUrl(selectedModel),
      cameraDistance: 3.0,  // Pulled back to see full body
      cameraHeight: 1.0,    // Lower to center on body
      enableOrbitControls: true,  // Enable camera orbit for debug
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

  // Update FBX mixer each frame (separate from main renderer)
  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();
    
    const updateFbxMixer = () => {
      const now = performance.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;
      
      if (fbxMixerRef.current) {
        fbxMixerRef.current.update(deltaTime);
        
        // VRM needs update after mixer to copy normalized → raw bones
        const vrm = rendererRef.current?.getVRM?.();
        if (vrm) {
          vrm.update(deltaTime);
        }
      }
      
      animationId = requestAnimationFrame(updateFbxMixer);
    };
    
    animationId = requestAnimationFrame(updateFbxMixer);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

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
  }, [lipSyncWeightMultiplier, lipSyncBlendSpeed, lipSyncMinHoldMs]);

  // FPS tracking
  useEffect(() => {
    let animationId: number;
    
    const trackFps = () => {
      const now = performance.now();
      fpsFramesRef.current.push(now);
      
      // Keep only last second of frames
      const oneSecondAgo = now - 1000;
      fpsFramesRef.current = fpsFramesRef.current.filter(t => t > oneSecondAgo);
      
      // Update FPS display every 500ms
      if (now - lastFpsUpdateRef.current > 500) {
        setFps(fpsFramesRef.current.length);
        lastFpsUpdateRef.current = now;
      }
      
      animationId = requestAnimationFrame(trackFps);
    };
    
    animationId = requestAnimationFrame(trackFps);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
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

  // Test TTS with ElevenLabs API (real visemes)
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
    
    // Clear any existing playback interval
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }

    try {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        renderer.lipSyncEngine.stop();
      }

      // Call backend TTS API
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
      
      // Decode base64 audio
      const audioData = atob(result.audio_base64);
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i);
      }
      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create audio element and wait for metadata
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      // Wait for duration to be available
      await new Promise<void>((resolve) => {
        if (audio.duration && !isNaN(audio.duration)) {
          resolve();
        } else {
          audio.onloadedmetadata = () => resolve();
        }
      });
      
      const actualMs = audio.duration * 1000;
      setActualDurationMs(actualMs);

      // Set up lip sync with alignment from ElevenLabs
      if (result.alignment) {
        console.log('[Debug] ElevenLabs alignment:', result.alignment);
        
        // Calculate predicted duration for UI display
        const { charStartTimesMs, charDurationsMs } = result.alignment;
        if (charStartTimesMs?.length) {
          const lastIdx = charStartTimesMs.length - 1;
          const predicted = charStartTimesMs[lastIdx] + (charDurationsMs[lastIdx] || 0);
          setPredictedDurationMs(predicted);
        }
        
        // Store alignment for UI display
        setAlignmentData(result.alignment);
        
        // LipSyncEngine handles scaling internally when audioDurationMs is provided
        const audioDurationMs = enableScaling ? actualMs : undefined;
        renderer.lipSyncEngine.setAlignment(result.alignment, audioDurationMs);
        renderer.lipSyncEngine.startSync(audio);
        setLastAction(`TTS: ${result.alignment.chars?.length || 0} chars, ${(actualMs/1000).toFixed(2)}s`);
      } else {
        console.log('[Debug] No alignment data in response');
        setAlignmentData(null);
        setLastAction(`TTS: NO ALIGNMENT DATA`);
      }

      // Track playback position
      setIsPlaying(true);
      playbackIntervalRef.current = window.setInterval(() => {
        if (audioRef.current) {
          setCurrentPlaybackMs(audioRef.current.currentTime * 1000);
        }
      }, 50);

      // Play audio
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
  }, [ttsText, voiceId, enableScaling]);

  // Test lip sync with audio file (uses fake visemes)
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

  // Stop speaking
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
  }, []);

  // Quick combo
  const waveHappy = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    
    renderer.expressionController?.setMood('happy', 0.8);
    renderer.animationPlayer?.play('wave');
    setLastAction('Wave + Happy');
  }, []);

  // FBX retarget test using vrm-mixamo-retarget library
  const handleFbxFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const renderer = rendererRef.current;
    
    if (!file || !renderer) {
      setFbxStatus('Error: No file or renderer');
      return;
    }

    const vrm = renderer.getVRM?.();
    if (!vrm) {
      setFbxStatus('Error: VRM not loaded');
      return;
    }

    setFbxStatus(`Loading ${file.name}...`);
    setLastAction(`FBX: Loading ${file.name}`);

    try {
      // Load FBX file
      const fbxLoader = new FBXLoader();
      const arrayBuffer = await file.arrayBuffer();
      const fbxAsset = fbxLoader.parse(arrayBuffer, '');
      
      console.log('[FBX Test] Loaded FBX:', fbxAsset);
      console.log('[FBX Test] Animations:', fbxAsset.animations);
      
      // List all bones in FBX
      const fbxBones: string[] = [];
      fbxAsset.traverse((obj) => {
        if (obj.type === 'Bone' || obj.name.includes('mixamorig')) {
          fbxBones.push(obj.name);
        }
      });
      console.log('[FBX Test] FBX bones:', fbxBones);
      
      // Use vrm-mixamo-retarget library
      const clip = retargetAnimation(fbxAsset, vrm, {
        logWarnings: true,
        animationClipName: 'mixamo.com'  // Default Mixamo clip name
      });
      
      if (!clip) {
        // Try with first available clip name
        if (fbxAsset.animations.length > 0) {
          const firstClipName = fbxAsset.animations[0].name;
          console.log('[FBX Test] Trying clip name:', firstClipName);
          const clip2 = retargetAnimation(fbxAsset, vrm, {
            logWarnings: true,
            animationClipName: firstClipName
          });
          if (clip2) {
            playFbxClip(clip2, vrm, file.name);
            return;
          }
        }
        setFbxStatus('Error: Retarget failed');
        setLastAction('FBX: Retarget failed - check console');
        return;
      }
      
      playFbxClip(clip, vrm, file.name);
      
    } catch (err) {
      console.error('[FBX Test] Error:', err);
      setFbxStatus(`Error: ${err}`);
      setLastAction(`FBX Error: ${err}`);
    }
  }, []);

  // Play retargeted FBX clip
  const playFbxClip = useCallback((clip: THREE.AnimationClip, vrm: VRM, fileName: string) => {
    console.log('[FBX Test] Retargeted clip:', clip);
    console.log('[FBX Test] Tracks:', clip.tracks.length);
    
    // Stop any existing FBX animation
    if (fbxActionRef.current) {
      fbxActionRef.current.stop();
    }
    
    // Create mixer on normalized humanoid root (like AnimationPlayer does)
    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    const mixer = new THREE.AnimationMixer(mixerRoot);
    fbxMixerRef.current = mixer;
    
    // Create and play action
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    fbxActionRef.current = action;
    
    setFbxStatus(`Playing: ${fileName}`);
    setLastAction(`FBX: ${clip.tracks.length} tracks, ${clip.duration.toFixed(1)}s`);
  }, []);

  // Stop FBX animation
  const stopFbxAnimation = useCallback(() => {
    if (fbxActionRef.current) {
      fbxActionRef.current.stop();
      fbxActionRef.current = null;
    }
    if (fbxMixerRef.current) {
      fbxMixerRef.current.stopAllAction();
      fbxMixerRef.current = null;
    }
    setFbxStatus('Upload Mixamo FBX');
    setGlbStatus('Upload GLB Animation');
    setLastAction('Animation: Stopped');
  }, []);

  // Drag and drop state for GLB
  const [isDraggingGlb, setIsDraggingGlb] = useState(false);
  const glbDropRef = useRef<HTMLLabelElement>(null);

  // Drag and drop state for VRMA
  const [isDraggingVrma, setIsDraggingVrma] = useState(false);
  const vrmaDropRef = useRef<HTMLLabelElement>(null);
  const [vrmaStatus, setVrmaStatus] = useState<string>('Upload VRMA Animation');

  // Handle GLB file (from input or drop)
  const processGlbFile = useCallback(async (file: File) => {
    const renderer = rendererRef.current;
    
    if (!file || !renderer) {
      setGlbStatus('Error: No file or renderer');
      return;
    }

    const vrm = renderer.getVRM?.();
    if (!vrm) {
      setGlbStatus('Error: VRM not loaded');
      return;
    }

    setGlbStatus(`Loading ${file.name}...`);
    setLastAction(`GLB: Loading ${file.name}`);

    try {
      // Load GLB file
      const gltfLoader = new GLTFLoader();
      const arrayBuffer = await file.arrayBuffer();
      const gltf = await new Promise<any>((resolve, reject) => {
        gltfLoader.parse(arrayBuffer, '', resolve, reject);
      });
      
      console.log('[GLB Test] Loaded GLB:', gltf);
      console.log('[GLB Test] Animations:', gltf.animations);
      
      if (!gltf.animations || gltf.animations.length === 0) {
        setGlbStatus('Error: No animations in GLB');
        setLastAction('GLB: No animations found');
        return;
      }
      
      // Get first animation clip
      const clip = gltf.animations[0] as THREE.AnimationClip;
      console.log('[GLB Test] Clip name:', clip.name);
      console.log('[GLB Test] Clip duration:', clip.duration);
      console.log('[GLB Test] Clip tracks:', clip.tracks.length);
      
      // Log track names to see bone naming convention
      clip.tracks.slice(0, 10).forEach((track, i) => {
        console.log(`[GLB Test] Track ${i}: ${track.name}`);
      });
      
      // Try direct play first (if GLB was pre-retargeted for VRM)
      playGlbClipDirect(clip, vrm, file.name);
      
    } catch (err) {
      console.error('[GLB Test] Error:', err);
      setGlbStatus(`Error: ${err}`);
      setLastAction(`GLB Error: ${err}`);
    }
  }, []);

  // Wrapper for file input change
  const handleGlbFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processGlbFile(file);
  }, [processGlbFile]);

  // Drag and drop handlers for GLB
  const handleGlbDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingGlb(true);
  }, []);

  const handleGlbDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingGlb(false);
  }, []);

  const handleGlbDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingGlb(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      processGlbFile(file);
    } else {
      setGlbStatus('Error: Drop a .glb or .gltf file');
    }
  }, [processGlbFile]);

  // Handle VRMA file (from input or drop)
  const processVrmaFile = useCallback(async (file: File) => {
    const renderer = rendererRef.current;
    
    if (!file || !renderer) {
      setVrmaStatus('Error: No file or renderer');
      return;
    }

    const vrm = renderer.getVRM?.();
    if (!vrm) {
      setVrmaStatus('Error: VRM not loaded');
      return;
    }

    setVrmaStatus(`Loading ${file.name}...`);
    setLastAction(`VRMA: Loading ${file.name}`);

    try {
      // Load VRMA file with VRMAnimationLoaderPlugin
      const gltfLoader = new GLTFLoader();
      gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      
      const arrayBuffer = await file.arrayBuffer();
      const gltf = await new Promise<any>((resolve, reject) => {
        gltfLoader.parse(arrayBuffer, '', resolve, reject);
      });
      
      console.log('[VRMA Test] Loaded VRMA:', gltf);
      console.log('[VRMA Test] userData:', gltf.userData);
      
      // Get VRM animation from userData
      const vrmAnimations: VRMAnimation[] = gltf.userData.vrmAnimations;
      if (!vrmAnimations || vrmAnimations.length === 0) {
        setVrmaStatus('Error: No VRM animations in file');
        setLastAction('VRMA: No animations found');
        return;
      }
      
      const vrmAnimation = vrmAnimations[0];
      console.log('[VRMA Test] VRMAnimation:', vrmAnimation);
      
      // Create animation clip for this VRM
      const clip = createVRMAnimationClip(vrmAnimation, vrm);
      console.log('[VRMA Test] Created clip:', clip);
      console.log('[VRMA Test] Clip tracks:', clip.tracks.length);
      console.log('[VRMA Test] Clip duration:', clip.duration);
      
      // Stop any existing animation
      if (fbxActionRef.current) {
        fbxActionRef.current.stop();
      }
      
      // Create mixer on VRM scene
      const mixer = new THREE.AnimationMixer(vrm.scene);
      fbxMixerRef.current = mixer;
      
      // Create and play action
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      fbxActionRef.current = action;
      
      setVrmaStatus(`Playing: ${file.name}`);
      setLastAction(`VRMA: ${clip.tracks.length} tracks, ${clip.duration.toFixed(1)}s`);
      
    } catch (err) {
      console.error('[VRMA Test] Error:', err);
      setVrmaStatus(`Error: ${err}`);
      setLastAction(`VRMA Error: ${err}`);
    }
  }, []);

  // Wrapper for VRMA file input change
  const handleVrmaFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processVrmaFile(file);
  }, [processVrmaFile]);

  // Drag and drop handlers for VRMA
  const handleVrmaDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVrma(true);
  }, []);

  const handleVrmaDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVrma(false);
  }, []);

  const handleVrmaDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVrma(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.vrma')) {
      processVrmaFile(file);
    } else {
      setVrmaStatus('Error: Drop a .vrma file');
    }
  }, [processVrmaFile]);

  // BVH/Bandai-Namco bone name mapping to VRM humanoid bones
  const bvhToVrmBoneMap: Record<string, string> = {
    'Hips': 'hips',
    'Spine': 'spine',
    'Spine1': 'chest',
    'Spine2': 'upperChest',
    'Chest': 'chest',
    'UpperChest': 'upperChest',
    'Neck': 'neck',
    'Head': 'head',
    // Left arm
    'Shoulder_L': 'leftShoulder',
    'LeftShoulder': 'leftShoulder',
    'UpperArm_L': 'leftUpperArm',
    'LeftUpperArm': 'leftUpperArm',
    'LowerArm_L': 'leftLowerArm',
    'LeftLowerArm': 'leftLowerArm',
    'Hand_L': 'leftHand',
    'LeftHand': 'leftHand',
    // Right arm
    'Shoulder_R': 'rightShoulder',
    'RightShoulder': 'rightShoulder',
    'UpperArm_R': 'rightUpperArm',
    'RightUpperArm': 'rightUpperArm',
    'LowerArm_R': 'rightLowerArm',
    'RightLowerArm': 'rightLowerArm',
    'Hand_R': 'rightHand',
    'RightHand': 'rightHand',
    // Left leg
    'UpperLeg_L': 'leftUpperLeg',
    'LeftUpperLeg': 'leftUpperLeg',
    'LowerLeg_L': 'leftLowerLeg',
    'LeftLowerLeg': 'leftLowerLeg',
    'Foot_L': 'leftFoot',
    'LeftFoot': 'leftFoot',
    'Toes_L': 'leftToes',
    'LeftToes': 'leftToes',
    // Right leg
    'UpperLeg_R': 'rightUpperLeg',
    'RightUpperLeg': 'rightUpperLeg',
    'LowerLeg_R': 'rightLowerLeg',
    'RightLowerLeg': 'rightLowerLeg',
    'Foot_R': 'rightFoot',
    'RightFoot': 'rightFoot',
    'Toes_R': 'rightToes',
    'RightToes': 'rightToes',
  };

  // Retarget GLB clip from BVH naming to VRM normalized bones
  const retargetGlbClip = useCallback((clip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip => {
    const newTracks: THREE.KeyframeTrack[] = [];
    let mapped = 0;
    let skipped = 0;
    
    for (const track of clip.tracks) {
      const dotIndex = track.name.indexOf('.');
      if (dotIndex === -1) {
        skipped++;
        continue;
      }
      
      const boneName = track.name.substring(0, dotIndex);
      const property = track.name.substring(dotIndex + 1);
      
      // Skip position/scale tracks (only want rotation)
      if (property === 'position' || property === 'scale') {
        skipped++;
        continue;
      }
      
      // Map bone name
      const vrmBoneName = bvhToVrmBoneMap[boneName];
      if (!vrmBoneName) {
        console.log(`[GLB Retarget] Unknown bone: ${boneName}`);
        skipped++;
        continue;
      }
      
      // Get VRM normalized bone node
      const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as any);
      if (!vrmNode) {
        console.log(`[GLB Retarget] No VRM bone for: ${vrmBoneName}`);
        skipped++;
        continue;
      }
      
      // Clone track with new target name
      const newTrack = track.clone();
      newTrack.name = `${vrmNode.name}.${property}`;
      newTracks.push(newTrack);
      mapped++;
    }
    
    console.log(`[GLB Retarget] Mapped: ${mapped}, Skipped: ${skipped}`);
    return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
  }, [bvhToVrmBoneMap]);

  // Play GLB clip with retargeting
  const playGlbClipDirect = useCallback((clip: THREE.AnimationClip, vrm: VRM, fileName: string) => {
    console.log('[GLB Test] Retargeting clip...');
    
    // Retarget from BVH naming to VRM
    const retargetedClip = retargetGlbClip(clip, vrm);
    
    if (retargetedClip.tracks.length === 0) {
      setGlbStatus('Error: No tracks after retarget');
      setLastAction('GLB: Retarget produced 0 tracks');
      return;
    }
    
    // Stop any existing animation
    if (fbxActionRef.current) {
      fbxActionRef.current.stop();
    }
    
    // Create mixer on normalized humanoid root
    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    const mixer = new THREE.AnimationMixer(mixerRoot);
    fbxMixerRef.current = mixer;
    
    // Create and play action
    const action = mixer.clipAction(retargetedClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    fbxActionRef.current = action;
    
    setGlbStatus(`Playing: ${fileName}`);
    setLastAction(`GLB: ${retargetedClip.tracks.length} tracks, ${retargetedClip.duration.toFixed(1)}s`);
  }, [retargetGlbClip]);

  return (
    <div className="min-h-[100svh] bg-bg-primary text-text-primary flex flex-col">
      <AppTopNav
        onBack={() => navigate({ to: '/manage' })}
        subtitle="Avatar Debug Panel"
        rightSlot={(
          <>
            <span className="text-xs text-text-secondary bg-bg-secondary/70 border border-white/10 px-3 py-1 rounded-full max-w-[200px] truncate">
              {lastAction}
            </span>
            <button
              onClick={() => navigate({ to: '/manage' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Agent Settings"
            >
              <Sliders className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate({ to: '/debug' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Debug Avatar"
            >
              <Bug className="w-5 h-5" />
            </button>
          </>
        )}
      />

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
          <div className="absolute top-4 left-4 bg-bg-primary/80 border border-white/10 backdrop-blur rounded-xl p-2">
            <select
              value={selectedModel}
              onChange={(e) => switchModel(e.target.value)}
              className="bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1 text-sm"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.version ? ` (${m.version})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 bg-bg-secondary/40 overflow-y-auto shrink-0">
          <Accordion type="multiple" defaultValue={["render-quality"]} className="px-3">
            
            {/* Render Quality */}
            <AccordionItem value="render-quality" className="border-white/10">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                <span className="flex items-center gap-2">
                  <Gauge className="w-4 h-4" />
                  Render Quality
                  <span className="ml-auto text-xs font-normal text-accent">{fps} FPS</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {/* Preset selector */}
                  <div>
                    <label className="text-xs text-text-secondary">Quality Preset</label>
                    <select
                      value={qualityPreset}
                      onChange={(e) => {
                        const preset = e.target.value as QualityPreset;
                        if (preset === 'custom') return;
                        setQualityPreset(preset);
                        setQualitySettings(getPreset(preset));
                      }}
                      className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1.5 text-sm mt-1"
                    >
                      <option value="low">Low (Performance)</option>
                      <option value="medium">Medium (Balanced)</option>
                      <option value="high">High (Quality)</option>
                      {qualityPreset === 'custom' && <option value="custom">Custom</option>}
                    </select>
                  </div>

                  {/* Individual controls */}
                  <div className="space-y-3 p-3 bg-bg-tertiary/60 border border-white/10 rounded-lg">
                    <div className="text-xs font-semibold text-text-secondary">Fine-Tune Settings</div>
                    
                    {/* Shadows */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qualitySettings.shadows}
                        onChange={(e) => {
                          setQualitySettings(prev => ({ ...prev, shadows: e.target.checked }));
                          setQualityPreset('custom');
                        }}
                        className="w-4 h-4 accent-accent"
                      />
                      <span className="text-xs text-text-secondary">Shadows</span>
                    </label>

                    {/* Shadow Map Size */}
                    {qualitySettings.shadows && (
                      <>
                        <div>
                          <label className="text-xs text-text-secondary">Shadow Map Size</label>
                          <select
                            value={qualitySettings.shadowMapSize}
                            onChange={(e) => {
                              setQualitySettings(prev => ({ ...prev, shadowMapSize: parseInt(e.target.value) }));
                              setQualityPreset('custom');
                            }}
                            className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1 text-xs mt-1"
                          >
                            <option value={512}>512 (Fast)</option>
                            <option value={1024}>1024 (Balanced)</option>
                            <option value={2048}>2048 (Quality)</option>
                          </select>
                        </div>
                        
                        {/* Shadow Bias */}
                        <div>
                          <div className="flex justify-between text-xs text-text-secondary mb-1">
                            <span>Shadow Bias (acne fix)</span>
                            <span className="text-accent">{qualitySettings.shadowBias.toFixed(4)}</span>
                          </div>
                          <input
                            type="range"
                            min="-0.005"
                            max="0"
                            step="0.0001"
                            value={qualitySettings.shadowBias}
                            onChange={(e) => {
                              setQualitySettings(prev => ({ ...prev, shadowBias: parseFloat(e.target.value) }));
                              setQualityPreset('custom');
                            }}
                            className="w-full h-2 accent-accent"
                          />
                        </div>
                        
                        {/* Shadow Normal Bias */}
                        <div>
                          <div className="flex justify-between text-xs text-text-secondary mb-1">
                            <span>Normal Bias (curved surfaces)</span>
                            <span className="text-accent">{qualitySettings.shadowNormalBias.toFixed(3)}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="0.2"
                            step="0.005"
                            value={qualitySettings.shadowNormalBias}
                            onChange={(e) => {
                              setQualitySettings(prev => ({ ...prev, shadowNormalBias: parseFloat(e.target.value) }));
                              setQualityPreset('custom');
                            }}
                            className="w-full h-2 accent-accent"
                          />
                        </div>
                      </>
                    )}

                    {/* Post-Processing */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qualitySettings.postProcessing}
                        onChange={(e) => {
                          setQualitySettings(prev => ({ ...prev, postProcessing: e.target.checked }));
                          setQualityPreset('custom');
                        }}
                        className="w-4 h-4 accent-accent"
                      />
                      <span className="text-xs text-text-secondary">Post-Processing</span>
                    </label>

                    {/* Bloom (only when post-processing enabled) */}
                    {qualitySettings.postProcessing && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer pl-4">
                          <input
                            type="checkbox"
                            checked={qualitySettings.bloom}
                            onChange={(e) => {
                              setQualitySettings(prev => ({ ...prev, bloom: e.target.checked }));
                              setQualityPreset('custom');
                            }}
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-xs text-text-secondary">Bloom</span>
                        </label>

                        {qualitySettings.bloom && (
                          <div className="pl-4 space-y-2">
                            <div>
                              <div className="flex justify-between text-xs text-text-secondary mb-1">
                                <span>Bloom Strength</span>
                                <span className="text-accent">{qualitySettings.bloomStrength.toFixed(2)}</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={qualitySettings.bloomStrength}
                                onChange={(e) => {
                                  setQualitySettings(prev => ({ ...prev, bloomStrength: parseFloat(e.target.value) }));
                                  setQualityPreset('custom');
                                }}
                                className="w-full h-2 accent-accent"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs text-text-secondary mb-1">
                                <span>Bloom Threshold</span>
                                <span className="text-accent">{qualitySettings.bloomThreshold.toFixed(2)}</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={qualitySettings.bloomThreshold}
                                onChange={(e) => {
                                  setQualitySettings(prev => ({ ...prev, bloomThreshold: parseFloat(e.target.value) }));
                                  setQualityPreset('custom');
                                }}
                                className="w-full h-2 accent-accent"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs text-text-secondary mb-1">
                                <span>Bloom Radius</span>
                                <span className="text-accent">{qualitySettings.bloomRadius.toFixed(2)}</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={qualitySettings.bloomRadius}
                                onChange={(e) => {
                                  setQualitySettings(prev => ({ ...prev, bloomRadius: parseFloat(e.target.value) }));
                                  setQualityPreset('custom');
                                }}
                                className="w-full h-2 accent-accent"
                              />
                            </div>
                          </div>
                        )}

                        <label className="flex items-center gap-2 cursor-pointer pl-4">
                          <input
                            type="checkbox"
                            checked={qualitySettings.smaa}
                            onChange={(e) => {
                              setQualitySettings(prev => ({ ...prev, smaa: e.target.checked }));
                              setQualityPreset('custom');
                            }}
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-xs text-text-secondary">SMAA (Anti-Aliasing)</span>
                        </label>
                      </>
                    )}

                    {/* Alpha To Coverage */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qualitySettings.alphaToCoverage}
                        onChange={(e) => {
                          setQualitySettings(prev => ({ ...prev, alphaToCoverage: e.target.checked }));
                          setQualityPreset('custom');
                        }}
                        className="w-4 h-4 accent-accent"
                      />
                      <span className="text-xs text-text-secondary">Alpha To Coverage (smooth edges)</span>
                    </label>
                  </div>

                  {/* Apply button */}
                  <Button
                    onClick={() => {
                      rendererRef.current?.applyQualitySettings(qualitySettings);
                      setLastAction(`Quality: ${qualityPreset}`);
                    }}
                    size="sm"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
                  >
                    Apply Quality Settings
                  </Button>

                  {/* Current settings summary */}
                  <div className="text-xs text-text-secondary/70 p-2 bg-bg-tertiary/80 border border-white/10 rounded font-mono">
                    <div>Pixel Ratio: {qualitySettings.pixelRatio.toFixed(1)}x</div>
                    <div>Shadows: {qualitySettings.shadows ? `ON (${qualitySettings.shadowMapSize}px)` : 'OFF'}</div>
                    <div>Post-FX: {qualitySettings.postProcessing ? 'ON' : 'OFF'}</div>
                    {qualitySettings.postProcessing && (
                      <>
                        <div className="pl-2">Bloom: {qualitySettings.bloom ? `${qualitySettings.bloomStrength.toFixed(2)}` : 'OFF'}</div>
                        <div className="pl-2">SMAA: {qualitySettings.smaa ? 'ON' : 'OFF'}</div>
                      </>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Look At */}
            <AccordionItem value="look-at" className="border-white/10">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                <span className="flex items-center gap-2">
                  👁️ Look At (Eyes + Head)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {/* Enable toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lookAtEnabled}
                      onChange={(e) => {
                        setLookAtEnabled(e.target.checked);
                        rendererRef.current?.setLookAtEnabled(e.target.checked);
                      }}
                      className="w-4 h-4 accent-accent"
                    />
                    <span className="text-sm text-text-secondary">Enable Look At</span>
                  </label>

                  {lookAtEnabled && (
                    <div className="space-y-3 p-3 bg-bg-tertiary/60 border border-white/10 rounded-lg">
                      {/* Max Angle */}
                      <div>
                        <div className="flex justify-between text-xs text-text-secondary mb-1">
                          <span>Max Angle (return to home)</span>
                          <span className="text-accent">{lookAtMaxAngle}°</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={80}
                          step={5}
                          value={lookAtMaxAngle}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setLookAtMaxAngle(val);
                            rendererRef.current?.setLookAtConfig({ maxAngle: val });
                          }}
                          className="w-full accent-accent"
                        />
                      </div>

                      {/* Eye Weight */}
                      <div>
                        <div className="flex justify-between text-xs text-text-secondary mb-1">
                          <span>Eye Movement</span>
                          <span className="text-accent">{(lookAtEyeWeight * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={lookAtEyeWeight}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setLookAtEyeWeight(val);
                            rendererRef.current?.setLookAtConfig({ eyeWeight: val });
                          }}
                          className="w-full accent-accent"
                        />
                      </div>

                      {/* Head Weight */}
                      <div>
                        <div className="flex justify-between text-xs text-text-secondary mb-1">
                          <span>Head Movement</span>
                          <span className="text-accent">{(lookAtHeadWeight * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={0.5}
                          step={0.05}
                          value={lookAtHeadWeight}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setLookAtHeadWeight(val);
                            rendererRef.current?.setLookAtConfig({ headWeight: val });
                          }}
                          className="w-full accent-accent"
                        />
                      </div>

                      <p className="text-xs text-text-secondary/70 mt-2">
                        Eyes and head follow camera. Returns to home position when camera angle exceeds max.
                      </p>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Animations */}
            <AccordionItem value="animations" className="border-white/10">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                Animations
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_ANIMATIONS.map((anim) => (
                    <Button
                      key={anim}
                      variant="ghost"
                      size="sm"
                      onClick={() => playAnimation(anim)}
                      className="justify-start text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      {anim}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-text-secondary mt-2">
                  GLB files → /public/animations/
                </p>
              </AccordionContent>
            </AccordionItem>

            {/* Mood / Expression */}
            <AccordionItem value="mood" className="border-white/10">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                Mood / Expression
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-secondary">Mood</label>
                    <select
                      value={currentMood}
                      onChange={(e) => setCurrentMood(e.target.value)}
                      className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1.5 text-sm mt-1"
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
                      className="w-full mt-1 accent-accent"
                    />
                  </div>
                  
                  <Button 
                    onClick={applyMood} 
                    size="sm" 
                    className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
                  >
                    Apply Mood
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* TTS Test */}
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
                    
                    {/* Weight Multiplier */}
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
                    
                    {/* Blend Speed */}
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
                    
                    {/* Min Hold Time */}
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
                    
                    {/* Reset button */}
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
                    
                    {/* Duration comparison */}
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
                    
                    {/* Duration mismatch indicator */}
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
                    
                    {/* Playback progress bar */}
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
                  
                  {/* Info about the issue */}
                  <div className="text-xs text-text-secondary/70 p-2 bg-warning/10 rounded border border-warning/30">
                    <strong>Known Issue:</strong> ElevenLabs timing is estimated, not measured from audio. 
                    Enable scaling to adjust timestamps to actual audio duration.
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Voice Chat Test */}
            <AccordionItem value="voice-chat" className="border-white/10">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                <span className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Hands-Free Voice ⭐
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {/* State indicator */}
                  <VoiceIndicator 
                    state={voiceChat.voiceState} 
                    transcript={voiceChat.interimTranscript}
                  />
                  
                  {/* Controls */}
                  <VoiceToggle
                    isEnabled={voiceChat.isEnabled}
                    isSupported={voiceChat.isSupported}
                    state={voiceChat.voiceState}
                    onEnable={voiceChat.enableVoice}
                    onDisable={voiceChat.disableVoice}
                    onActivate={voiceChat.activate}
                    onDeactivate={voiceChat.deactivate}
                    onCancel={voiceChat.cancel}
                  />
                  
                  {/* Last transcript */}
                  {voiceTranscript && (
                    <div className="p-3 bg-bg-tertiary/80 border border-white/10 rounded-lg">
                      <div className="text-xs text-text-secondary mb-1">Last Transcript:</div>
                      <div className="text-sm text-text-primary">{voiceTranscript}</div>
                    </div>
                  )}

                  <VoiceDebugTimeline
                    entries={voiceDebugEvents}
                    onClear={clearVoiceDebugEvents}
                    className="max-h-72 overflow-hidden"
                    listHeightClass="h-40"
                  />
                  
                  {/* Info */}
                  <div className="text-xs text-text-secondary space-y-1 bg-bg-tertiary/80 border border-white/10 p-2 rounded">
                    <div className="font-semibold">How it works:</div>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Enable Voice → starts wake word listener (mocked)</li>
                      <li>Click "Start Listening" → activates VAD + STT</li>
                      <li>Speak, pause → VAD detects silence → STT transcribes</li>
                      <li>Audio sent to backend `/api/transcribe`</li>
                      <li>Transcript logged (would send to /api/chat)</li>
                    </ol>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Audio File Test */}
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

            {/* Animation Upload Test */}
            <AccordionItem value="anim-upload" className="border-white/10">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                Animation Upload ⭐
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {/* FBX Upload */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-text-secondary">Mixamo FBX (vrm-mixamo-retarget)</div>
                    <label className="flex items-center justify-center gap-2 bg-bg-tertiary/70 border border-dashed border-white/10 rounded-lg p-3 cursor-pointer hover:bg-bg-secondary transition-colors">
                      <FileUp className="w-4 h-4 text-text-secondary" />
                      <span className="text-sm text-text-secondary">{fbxStatus}</span>
                      <input
                        type="file"
                        accept=".fbx"
                        onChange={handleFbxFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  {/* GLB Upload with Drag & Drop */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-text-secondary">GLB Animation (drag & drop supported)</div>
                    <label 
                      ref={glbDropRef}
                      onDragOver={handleGlbDragOver}
                      onDragLeave={handleGlbDragLeave}
                      onDrop={handleGlbDrop}
                      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
                        isDraggingGlb 
                          ? 'bg-accent/20 border-accent text-accent' 
                          : 'bg-bg-tertiary/70 border-white/20 hover:bg-bg-secondary hover:border-white/30'
                      }`}
                    >
                      <FileUp className={`w-6 h-6 ${isDraggingGlb ? 'text-accent' : 'text-text-secondary'}`} />
                      <span className={`text-sm ${isDraggingGlb ? 'text-accent' : 'text-text-secondary'}`}>
                        {isDraggingGlb ? 'Drop GLB here!' : glbStatus}
                      </span>
                      <span className="text-xs text-text-secondary/60">
                        Click or drag & drop .glb/.gltf
                      </span>
                      <input
                        type="file"
                        accept=".glb,.gltf"
                        onChange={handleGlbFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  {/* VRMA Upload with Drag & Drop */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-text-secondary">VRMA Animation (VRM native format)</div>
                    <label 
                      ref={vrmaDropRef}
                      onDragOver={handleVrmaDragOver}
                      onDragLeave={handleVrmaDragLeave}
                      onDrop={handleVrmaDrop}
                      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
                        isDraggingVrma 
                          ? 'bg-accent/20 border-accent text-accent' 
                          : 'bg-bg-tertiary/70 border-white/20 hover:bg-bg-secondary hover:border-white/30'
                      }`}
                    >
                      <FileUp className={`w-6 h-6 ${isDraggingVrma ? 'text-accent' : 'text-text-secondary'}`} />
                      <span className={`text-sm ${isDraggingVrma ? 'text-accent' : 'text-text-secondary'}`}>
                        {isDraggingVrma ? 'Drop VRMA here!' : vrmaStatus}
                      </span>
                      <span className="text-xs text-text-secondary/60">
                        Click or drag & drop .vrma
                      </span>
                      <input
                        type="file"
                        accept=".vrma"
                        onChange={handleVrmaFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={stopFbxAnimation} 
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
                  >
                    Stop Animation
                  </Button>
                  
                  <div className="text-xs text-text-secondary space-y-1 bg-bg-tertiary/80 border border-white/10 p-2 rounded">
                    <div className="font-semibold">Sources:</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><strong>FBX:</strong> mixamo.com → Download FBX (With Skin)</li>
                      <li><strong>GLB:</strong> convert3d.org/bvh-to-glb/app</li>
                      <li><strong>VRMA:</strong> VRM Animation files (native VRM format)</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Quick Actions */}
            <AccordionItem value="quick" className="border-white/10 border-b-0">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                Quick Actions
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
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
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
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
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
                    onClick={waveHappy}
                  >
                    👋 Wave + Happy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
                    onClick={() => {
                      rendererRef.current?.animationPlayer?.play('bow');
                      setLastAction('Bow');
                    }}
                  >
                    🙇 Bow
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10 bg-warning/10"
                    onClick={() => {
                      (rendererRef.current?.animationPlayer as any)?.testDirectBone?.();
                      setLastAction('Direct bone test');
                    }}
                  >
                    🔧 Direct Bone Test
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </div>
      </div>
    </div>
  );
}

export default AvatarDebugPanel;
