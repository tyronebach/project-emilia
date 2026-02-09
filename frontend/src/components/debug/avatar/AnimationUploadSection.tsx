import { useState, useCallback, useRef } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '../../ui/button';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retargetAnimation } from 'vrm-mixamo-retarget';
import { VRMAnimationLoaderPlugin, VRMAnimation, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import { useAvatarDebug } from './AvatarDebugContext';

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

function retargetGlbClip(clip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip {
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

    if (property === 'position' || property === 'scale') {
      skipped++;
      continue;
    }

    const vrmBoneName = bvhToVrmBoneMap[boneName];
    if (!vrmBoneName) {
      console.log(`[GLB Retarget] Unknown bone: ${boneName}`);
      skipped++;
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bone names are runtime strings
    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as any);
    if (!vrmNode) {
      console.log(`[GLB Retarget] No VRM bone for: ${vrmBoneName}`);
      skipped++;
      continue;
    }

    const newTrack = track.clone();
    newTrack.name = `${vrmNode.name}.${property}`;
    newTracks.push(newTrack);
    mapped++;
  }

  console.log(`[GLB Retarget] Mapped: ${mapped}, Skipped: ${skipped}`);
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

export function AnimationUploadSection() {
  const { rendererRef, fbxMixerRef, fbxActionRef, setLastAction } = useAvatarDebug();

  const [fbxStatus, setFbxStatus] = useState<string>('Upload Mixamo FBX');
  const [glbStatus, setGlbStatus] = useState<string>('Upload GLB Animation');
  const [vrmaStatus, setVrmaStatus] = useState<string>('Upload VRMA Animation');
  const [isDraggingGlb, setIsDraggingGlb] = useState(false);
  const [isDraggingVrma, setIsDraggingVrma] = useState(false);
  const glbDropRef = useRef<HTMLLabelElement>(null);
  const vrmaDropRef = useRef<HTMLLabelElement>(null);

  const playFbxClip = useCallback((clip: THREE.AnimationClip, vrm: VRM, fileName: string) => {
    console.log('[FBX Test] Retargeted clip:', clip);
    console.log('[FBX Test] Tracks:', clip.tracks.length);

    if (fbxActionRef.current) {
      fbxActionRef.current.stop();
    }

    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    const mixer = new THREE.AnimationMixer(mixerRoot);
    fbxMixerRef.current = mixer;

    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    fbxActionRef.current = action;

    setFbxStatus(`Playing: ${fileName}`);
    setLastAction(`FBX: ${clip.tracks.length} tracks, ${clip.duration.toFixed(1)}s`);
  }, [fbxMixerRef, fbxActionRef, setLastAction]);

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
      const fbxLoader = new FBXLoader();
      const arrayBuffer = await file.arrayBuffer();
      const fbxAsset = fbxLoader.parse(arrayBuffer, '');

      console.log('[FBX Test] Loaded FBX:', fbxAsset);
      console.log('[FBX Test] Animations:', fbxAsset.animations);

      const fbxBones: string[] = [];
      fbxAsset.traverse((obj) => {
        if (obj.type === 'Bone' || obj.name.includes('mixamorig')) {
          fbxBones.push(obj.name);
        }
      });
      console.log('[FBX Test] FBX bones:', fbxBones);

      const clip = retargetAnimation(fbxAsset, vrm, {
        logWarnings: true,
        animationClipName: 'mixamo.com'
      });

      if (!clip) {
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
  }, [rendererRef, playFbxClip, setLastAction]);

  const playGlbClipDirect = useCallback((clip: THREE.AnimationClip, vrm: VRM, fileName: string) => {
    console.log('[GLB Test] Retargeting clip...');

    const retargetedClip = retargetGlbClip(clip, vrm);

    if (retargetedClip.tracks.length === 0) {
      setGlbStatus('Error: No tracks after retarget');
      setLastAction('GLB: Retarget produced 0 tracks');
      return;
    }

    if (fbxActionRef.current) {
      fbxActionRef.current.stop();
    }

    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    const mixer = new THREE.AnimationMixer(mixerRoot);
    fbxMixerRef.current = mixer;

    const action = mixer.clipAction(retargetedClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    fbxActionRef.current = action;

    setGlbStatus(`Playing: ${fileName}`);
    setLastAction(`GLB: ${retargetedClip.tracks.length} tracks, ${retargetedClip.duration.toFixed(1)}s`);
  }, [fbxMixerRef, fbxActionRef, setLastAction]);

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
      const gltfLoader = new GLTFLoader();
      const arrayBuffer = await file.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GLTFLoader parse callback typing
      const gltf: any = await new Promise((resolve, reject) => {
        gltfLoader.parse(arrayBuffer, '', resolve, reject);
      });

      console.log('[GLB Test] Loaded GLB:', gltf);
      console.log('[GLB Test] Animations:', gltf.animations);

      if (!gltf.animations || gltf.animations.length === 0) {
        setGlbStatus('Error: No animations in GLB');
        setLastAction('GLB: No animations found');
        return;
      }

      const clip = gltf.animations[0] as THREE.AnimationClip;
      console.log('[GLB Test] Clip name:', clip.name);
      console.log('[GLB Test] Clip duration:', clip.duration);
      console.log('[GLB Test] Clip tracks:', clip.tracks.length);

      clip.tracks.slice(0, 10).forEach((track, i) => {
        console.log(`[GLB Test] Track ${i}: ${track.name}`);
      });

      playGlbClipDirect(clip, vrm, file.name);
    } catch (err) {
      console.error('[GLB Test] Error:', err);
      setGlbStatus(`Error: ${err}`);
      setLastAction(`GLB Error: ${err}`);
    }
  }, [rendererRef, playGlbClipDirect, setLastAction]);

  const handleGlbFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processGlbFile(file);
  }, [processGlbFile]);

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
      const gltfLoader = new GLTFLoader();
      gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

      const arrayBuffer = await file.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GLTFLoader parse callback typing
      const gltf: any = await new Promise((resolve, reject) => {
        gltfLoader.parse(arrayBuffer, '', resolve, reject);
      });

      console.log('[VRMA Test] Loaded VRMA:', gltf);
      console.log('[VRMA Test] userData:', gltf.userData);

      const vrmAnimations: VRMAnimation[] = gltf.userData.vrmAnimations;
      if (!vrmAnimations || vrmAnimations.length === 0) {
        setVrmaStatus('Error: No VRM animations in file');
        setLastAction('VRMA: No animations found');
        return;
      }

      const vrmAnimation = vrmAnimations[0];
      console.log('[VRMA Test] VRMAnimation:', vrmAnimation);

      const clip = createVRMAnimationClip(vrmAnimation, vrm);
      console.log('[VRMA Test] Created clip:', clip);
      console.log('[VRMA Test] Clip tracks:', clip.tracks.length);
      console.log('[VRMA Test] Clip duration:', clip.duration);

      if (fbxActionRef.current) {
        fbxActionRef.current.stop();
      }

      const mixer = new THREE.AnimationMixer(vrm.scene);
      fbxMixerRef.current = mixer;

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
  }, [rendererRef, fbxMixerRef, fbxActionRef, setLastAction]);

  const handleVrmaFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processVrmaFile(file);
  }, [processVrmaFile]);

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
  }, [fbxMixerRef, fbxActionRef, setLastAction]);

  return (
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
  );
}
