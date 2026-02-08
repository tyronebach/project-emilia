# ElevenLabs + Viseme Lip Sync Research

## The Problem

ElevenLabs provides character/word-level **timing data**, but NOT viseme data. When generating visemes separately, the timing often doesn't match the actual audio duration, causing:
- Visemes finishing before audio ends
- Scaling visemes linearly causes lip sync to drift

## Root Cause

ElevenLabs timing data is based on **text-to-phoneme estimation**, not actual audio waveform analysis. The generated audio's actual duration can differ from predicted timing due to:
- Speech rate variations
- Pauses and breaths
- Model-specific pronunciation quirks

## Solutions Used by Other Developers

### 1. Audio-Driven Viseme Detection (Recommended)

**Don't rely on text timing — analyze the audio waveform directly.**

**HeadAudio** (met4citizen/HeadAudio):
- Audio worklet that detects visemes from audio in real-time
- No text transcription needed
- Works with any TTS, including ElevenLabs
- GitHub: https://github.com/met4citizen/HeadAudio

**OVR Lip Sync** (Oculus/Meta):
- Takes raw audio bytes → outputs visemes at 100fps
- Industry standard for VR avatars
- Works with VRM's Oculus viseme blendshapes

### 2. Mascot Bot Proxy Approach

Mascot Bot intercepts ElevenLabs WebSocket stream and:
1. Analyzes audio chunks in real-time
2. Injects synchronized viseme events
3. Provides natural lip sync processing to avoid robotic over-articulation

Key config parameters:
```javascript
{
  minVisemeInterval: 40,      // Min ms between visemes
  mergeWindow: 60,            // Merge similar visemes within window
  keyVisemePreference: 0.6,   // Prefer key visemes over transitions
  preserveSilence: true,      // Don't animate during silence
  similarityThreshold: 0.4,   // Merge threshold
  preserveCriticalVisemes: true,
  criticalVisemeMinDuration: 80
}
```

### 3. TalkingHead Library Approach

Uses ElevenLabs with-timestamps API + phoneme lookup:

```javascript
// speakAudio() accepts:
{
  audio: AudioBuffer,         // The audio data
  words: ["Hello", "world"],  // Word array
  wtimes: [0, 500],           // Word start times (ms)
  wdurations: [400, 600],     // Word durations (ms)
  visemes: [0, 1, 2, ...],    // Optional: Oculus viseme IDs
  vtimes: [0, 100, 200, ...], // Viseme start times
  vdurations: [80, 90, ...]   // Viseme durations
}
```

If visemes not provided, TalkingHead:
1. Converts words → phonemes (via CMU dictionary or built-in rules)
2. Maps phonemes → Oculus visemes
3. Distributes timing across word duration

**Critical params:**
```javascript
ttsTrimStart: 0,    // Trim viseme sequence start (ms)
ttsTrimEnd: 400     // Trim viseme sequence end (ms) — IMPORTANT!
```

### 4. Rhubarb Lip Sync (Offline)

Separate CLI tool that analyzes audio + optional transcript:
```bash
rhubarb audio.wav -o output.json --dialogFile transcript.txt
```

Outputs timed viseme data. Good for pre-rendered content, not real-time.

---

## ElevenLabs API Reference

### With Timestamps Endpoint

```
POST /v1/text-to-speech/{voice_id}/with-timestamps
```

Response:
```json
{
  "audio_base64": "...",
  "alignment": {
    "characters": ["H", "e", "l", "l", "o"],
    "character_start_times_seconds": [0.0, 0.1, 0.15, 0.2, 0.25],
    "character_end_times_seconds": [0.1, 0.15, 0.2, 0.25, 0.35]
  },
  "normalized_alignment": {
    // Same structure for normalized text
  }
}
```

**Note:** These are **estimated** times, not actual audio analysis.

### Streaming with Timestamps (WebSocket)

```javascript
const response = await client.textToSpeech.streamWithTimestamps(voiceId, {
  text: "Hello world",
  output_format: 'pcm_22050'
});
```

---

## Oculus Viseme Reference

15 visemes for VRM/VRChat compatibility:

| ID | Name | Phonemes | Example |
|----|------|----------|---------|
| 0 | sil | silence | (pause) |
| 1 | PP | p, b, m | **p**at, **b**at |
| 2 | FF | f, v | **f**at, **v**at |
| 3 | TH | θ, ð | **th**in, **th**at |
| 4 | DD | t, d, n, l | **t**ap, **d**ad |
| 5 | kk | k, g | **k**ick, **g**et |
| 6 | CH | tʃ, dʒ, ʃ, ʒ | **ch**in, **j**et |
| 7 | SS | s, z | **s**it, **z**ap |
| 8 | nn | n, l | **n**ap, **l**ip |
| 9 | RR | r | **r**ed |
| 10 | aa | ɑ, æ | f**a**ther, c**a**t |
| 11 | E | ɛ, eɪ | b**e**d, s**ay** |
| 12 | ih | ɪ, i | s**i**t, s**ee** |
| 13 | oh | oʊ, ɔ | g**o**, l**aw** |
| 14 | ou | u, ʊ | b**oo**t, p**u**t |

---

## Recommended Implementation for Emilia

### Option A: Real-time Audio Analysis (Best)

Use HeadAudio or similar audio worklet:

```javascript
import { HeadAudio } from '@met4citizen/headaudio';

// Create audio analyzer
const headAudio = new HeadAudio({
  onViseme: (visemeId, weight) => {
    // Apply to VRM blendshapes
    vrm.expressionManager.setValue(`viseme_${visemeNames[visemeId]}`, weight);
  }
});

// Connect ElevenLabs audio stream
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(elevenLabsStream);
source.connect(headAudio.node);
```

### Option B: Phoneme-to-Viseme with Timing Correction

1. Get ElevenLabs audio + timestamps
2. Measure actual audio duration
3. Scale all timestamps proportionally:

```javascript
function scaleTimestamps(alignment, actualDuration) {
  const predictedDuration = alignment.character_end_times_seconds.at(-1);
  const scale = actualDuration / predictedDuration;
  
  return {
    ...alignment,
    character_start_times_seconds: alignment.character_start_times_seconds.map(t => t * scale),
    character_end_times_seconds: alignment.character_end_times_seconds.map(t => t * scale)
  };
}
```

4. Convert characters → phonemes → visemes
5. Apply with scaled timing

### Option C: Hybrid (TalkingHead Style)

Use TalkingHead library directly — it handles ElevenLabs integration:

```javascript
import { TalkingHead } from 'talkinghead';

const head = new TalkingHead(container, {
  lipsyncModules: ['en'],
  ttsTrimEnd: 400  // Critical: trim end to prevent early finish
});

// ElevenLabs integration
const elevenLabsAudio = await fetchElevenLabsWithTimestamps(text);
head.speakAudio({
  audio: elevenLabsAudio.audioBuffer,
  words: extractWords(elevenLabsAudio.alignment),
  wtimes: extractWordTimes(elevenLabsAudio.alignment),
  wdurations: extractWordDurations(elevenLabsAudio.alignment)
});
```

---

## Key Takeaways

1. **Don't trust ElevenLabs timing alone** — it's estimated, not measured
2. **Audio analysis > text timing** for accurate lip sync
3. **Scale timestamps** if you must use text timing — measure actual audio duration
4. **ttsTrimEnd: 400** — TalkingHead trims 400ms from end by default to compensate
5. **Use Oculus 15-viseme standard** for VRM compatibility
6. **Natural lip sync processing** — merge similar visemes to avoid robotic over-articulation

---

## References

- TalkingHead: https://github.com/met4citizen/TalkingHead
- HeadAudio: https://github.com/met4citizen/HeadAudio
- Mascot Bot SDK: https://docs.mascot.bot/libraries/elevenlabs-avatar
- ElevenLabs Timestamps: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- Oculus Viseme Reference: https://developers.meta.com/horizon/documentation/unity/audio-ovrlipsync-viseme-reference/
- Rhubarb Lip Sync: https://github.com/DanielSWolf/rhubarb-lip-sync
