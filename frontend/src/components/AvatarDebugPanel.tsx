/**
 * Avatar Debug Panel
 * Test VRM models, animations, expressions, and lip sync
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Play, Upload, RefreshCw, Mic, FileUp } from 'lucide-react';
import { Button } from './ui/button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { AvatarRenderer } from '../avatar/AvatarRenderer';
import { fetchWithAuth } from '../utils/api';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retargetAnimation } from 'vrm-mixamo-retarget';

type VrmModel = {
  id: string;
  name: string;
  version?: string;
};

const VRM_BASE_PATH = '/vrm';

// Fallback models if manifest fails to load
const DEFAULT_MODELS: VrmModel[] = [
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
  const [availableModels, setAvailableModels] = useState<VrmModel[]>(DEFAULT_MODELS);
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
  
  // FBX retarget test state
  const [fbxStatus, setFbxStatus] = useState<string>('Upload Mixamo FBX');
  const [glbStatus, setGlbStatus] = useState<string>('Upload GLB Animation');
  const fbxMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const fbxActionRef = useRef<THREE.AnimationAction | null>(null);

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

  // Load VRM manifest (public/vrm/vrm-manifest.json)
  useEffect(() => {
    let isActive = true;

    const loadManifest = async () => {
      try {
        const response = await fetch(`${VRM_BASE_PATH}/vrm-manifest.json`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Manifest request failed: ${response.status}`);
        }

        const manifest = await response.json();
        if (!Array.isArray(manifest)) {
          throw new Error('Manifest is not an array');
        }

        const models = manifest
          .filter((item) => item && typeof item.id === 'string')
          .map((item) => ({
            id: item.id,
            name: typeof item.name === 'string' ? item.name : item.id,
            version: typeof item.version === 'string' ? item.version : undefined,
          }));

        if (!models.length || !isActive) return;

        setAvailableModels(models);

        if (!models.some((m) => m.id === selectedModel)) {
          setSelectedModel(models[0].id);
          if (rendererRef.current) {
            switchModel(models[0].id);
          }
        }
      } catch (err) {
        console.warn('[AvatarDebugPanel] Failed to load VRM manifest:', err);
      }
    };

    loadManifest();

    return () => {
      isActive = false;
    };
  }, [selectedModel, switchModel]);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl: buildVrmUrl(selectedModel),
      cameraDistance: 3.0,  // Pulled back to see full body
      cameraHeight: 1.0,    // Lower to center on body
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
    setLastAction('Calling ElevenLabs...');

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

      // Create audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Set up lip sync with REAL alignment from ElevenLabs
      if (result.alignment) {
        console.log('[Debug] ElevenLabs alignment:', result.alignment);
        setAlignmentData(result.alignment);
        renderer.lipSyncEngine.setAlignment(result.alignment);
        renderer.lipSyncEngine.startSync(audio);
        setLastAction(`TTS: ${result.alignment.chars?.length || 0} chars`);
      } else {
        console.log('[Debug] No alignment data in response');
        setAlignmentData(null);
        setLastAction(`TTS: NO ALIGNMENT DATA`);
      }

      // Play audio
      audio.onended = () => {
        renderer.lipSyncEngine?.stop();
        URL.revokeObjectURL(audioUrl);
        setLastAction('TTS finished');
      };

      await audio.play();
    } catch (err) {
      setLastAction(`TTS Error: ${err}`);
    } finally {
      setTtsLoading(false);
    }
  }, [ttsText, voiceId]);

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

  // GLB animation test (pre-converted animations from convert3d.org etc)
  const handleGlbFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.version ? ` (${m.version})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-bg-tertiary overflow-y-auto shrink-0">
          <Accordion type="multiple" defaultValue={["tts"]} className="px-2">
            
            {/* Animations */}
            <AccordionItem value="animations" className="border-bg-tertiary">
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
              </AccordionContent>
            </AccordionItem>

            {/* Mood / Expression */}
            <AccordionItem value="mood" className="border-bg-tertiary">
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
                    className="w-full bg-indigo-500 text-white hover:bg-indigo-400"
                  >
                    Apply Mood
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* TTS Test */}
            <AccordionItem value="tts" className="border-bg-tertiary">
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
                      className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm mt-1 resize-none"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs text-text-secondary">Voice (ElevenLabs)</label>
                    <select
                      value={voiceId || ''}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm mt-1 focus:border-accent focus:outline-none"
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
                    className="w-full bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50"
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
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
                  >
                    Stop
                  </Button>
                  
                  {/* Alignment Data Display */}
                  <div className="mt-3 p-2 bg-bg-tertiary rounded text-xs font-mono">
                    <div className="text-text-secondary mb-1">Alignment Data:</div>
                    {alignmentData ? (
                      <div className="space-y-1">
                        <div className="text-green-400">✓ {alignmentData.chars?.length || 0} characters</div>
                        <div className="text-text-secondary overflow-hidden">
                          chars: {alignmentData.chars?.slice(0, 30).join('') || 'none'}...
                        </div>
                        <div className="text-text-secondary">
                          times: [{alignmentData.charStartTimesMs?.slice(0, 5).join(', ')}...]
                        </div>
                      </div>
                    ) : (
                      <div className="text-red-400">✗ No alignment data</div>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Audio File Test */}
            <AccordionItem value="audio-file" className="border-bg-tertiary">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                Audio File Test
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
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
                  <p className="text-xs text-text-secondary">
                    Uses random visemes (for testing without API)
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Animation Upload Test */}
            <AccordionItem value="anim-upload" className="border-bg-tertiary">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                Animation Upload ⭐
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {/* FBX Upload */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-indigo-400">Mixamo FBX (vrm-mixamo-retarget)</div>
                    <label className="flex items-center justify-center gap-2 bg-indigo-500/20 border border-dashed border-indigo-400/50 rounded-lg p-3 cursor-pointer hover:bg-indigo-500/30 transition-colors">
                      <FileUp className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm text-indigo-300">{fbxStatus}</span>
                      <input
                        type="file"
                        accept=".fbx"
                        onChange={handleFbxFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  {/* GLB Upload */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-green-400">GLB Animation (convert3d.org etc)</div>
                    <label className="flex items-center justify-center gap-2 bg-green-500/20 border border-dashed border-green-400/50 rounded-lg p-3 cursor-pointer hover:bg-green-500/30 transition-colors">
                      <FileUp className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-green-300">{glbStatus}</span>
                      <input
                        type="file"
                        accept=".glb,.gltf"
                        onChange={handleGlbFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={stopFbxAnimation} 
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
                  >
                    Stop Animation
                  </Button>
                  
                  <div className="text-xs text-text-secondary space-y-1 bg-bg-tertiary p-2 rounded">
                    <div className="font-semibold">Sources:</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><strong>FBX:</strong> mixamo.com → Download FBX (With Skin)</li>
                      <li><strong>GLB:</strong> convert3d.org/bvh-to-glb/app</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Quick Actions */}
            <AccordionItem value="quick" className="border-bg-tertiary border-b-0">
              <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
                Quick Actions
              </AccordionTrigger>
              <AccordionContent>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
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
                    className="w-full text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary bg-yellow-500/20"
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
