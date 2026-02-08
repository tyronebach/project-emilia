"""ElevenLabs TTS service with alignment data for lip sync."""
import base64
import hashlib
import json
import logging
import time

import httpx
from config import settings
from core.exceptions import TTSError
from db.repositories.tts_cache import TTSCacheRepository

logger = logging.getLogger(__name__)


class ElevenLabsService:
    """Client for ElevenLabs TTS API."""

    @staticmethod
    async def synthesize(text: str, voice_id: str | None = None) -> dict:
        """Synthesize speech with character-level alignment data.

        Returns dict with audio_base64, alignment, voice_id, duration_estimate.
        Raises TTSError on failure.
        """
        if not settings.elevenlabs_api_key:
            raise TTSError("TTS not configured - missing API key")

        voice_id = voice_id or settings.elevenlabs_voice_id
        normalized_text = " ".join(text.strip().split())
        if not normalized_text:
            raise TTSError("Empty text")

        voice_settings = {"stability": 0.5, "similarity_boost": 0.75}
        model_id = settings.elevenlabs_model
        cache_key = None
        cache_age_seconds = None

        if settings.tts_cache_enabled:
            cache_payload = {
                "voice_id": voice_id,
                "model_id": model_id,
                "voice_settings": voice_settings,
                "text": normalized_text,
            }
            cache_key = hashlib.sha256(
                json.dumps(cache_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            ).hexdigest()

            cached = TTSCacheRepository.get(cache_key)
            if cached:
                now = int(time.time())
                created_at = cached.get("created_at") or now
                cache_age_seconds = max(0, now - created_at)

                ttl_seconds = settings.tts_cache_ttl_seconds
                if ttl_seconds <= 0 or cache_age_seconds > ttl_seconds:
                    TTSCacheRepository.expire(ttl_seconds)
                else:
                    alignment_json = cached.get("alignment_json")
                    alignment = json.loads(alignment_json) if alignment_json else None
                    return {
                        "audio_base64": cached.get("audio_base64", ""),
                        "alignment": alignment,
                        "voice_id": cached.get("voice_id", voice_id),
                        "duration_estimate": cached.get("duration_estimate"),
                        "cache_hit": True,
                        "cache_key": cache_key,
                        "cache_age_seconds": cache_age_seconds,
                    }

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
        headers = {
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "text": normalized_text,
            "model_id": model_id,
            "voice_settings": voice_settings
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)

                if response.status_code != 200:
                    raise TTSError(f"ElevenLabs API error: {response.status_code}")

                data = response.json()

                audio_base64 = data.get("audio_base64", "")
                if not audio_base64:
                    raise TTSError("No audio in response")

                # Extract alignment data
                alignment = data.get("alignment") or data.get("normalized_alignment")
                transformed_alignment = None

                if alignment:
                    chars = alignment.get("characters", [])
                    start_times = alignment.get("character_start_times_seconds", [])
                    end_times = alignment.get("character_end_times_seconds", [])

                    if chars and start_times and end_times:
                        charStartTimesMs = [int(t * 1000) for t in start_times]
                        charDurationsMs = [
                            int((end_times[i] - start_times[i]) * 1000)
                            for i in range(min(len(start_times), len(end_times)))
                        ]
                        transformed_alignment = {
                            "chars": chars,
                            "charStartTimesMs": charStartTimesMs,
                            "charDurationsMs": charDurationsMs
                        }

                # Duration from alignment if available, else estimate from text
                if transformed_alignment and transformed_alignment["charStartTimesMs"]:
                    last_start = transformed_alignment["charStartTimesMs"][-1]
                    last_dur = transformed_alignment["charDurationsMs"][-1]
                    duration_estimate = (last_start + last_dur) / 1000.0
                else:
                    duration_estimate = len(normalized_text) / 12.0

                result = {
                    "audio_base64": audio_base64,
                    "alignment": transformed_alignment,
                    "voice_id": voice_id,
                    "duration_estimate": duration_estimate,
                    "cache_hit": False,
                }

                if cache_key:
                    result["cache_key"] = cache_key

                if settings.tts_cache_enabled and cache_key:
                    alignment_json = (
                        json.dumps(transformed_alignment, separators=(",", ":"), ensure_ascii=False)
                        if transformed_alignment
                        else None
                    )
                    voice_settings_json = json.dumps(voice_settings, separators=(",", ":"), ensure_ascii=False)
                    audio_bytes = len(base64.b64decode(audio_base64)) if audio_base64 else 0
                    TTSCacheRepository.put(
                        cache_key,
                        voice_id,
                        model_id,
                        voice_settings_json,
                        normalized_text,
                        audio_base64,
                        alignment_json,
                        duration_estimate,
                        audio_bytes,
                    )
                    TTSCacheRepository.expire(settings.tts_cache_ttl_seconds)
                    TTSCacheRepository.prune(settings.tts_cache_max_entries)

                return result

        except httpx.RequestError as e:
            logger.error("ElevenLabs request error: %s", e)
            raise TTSError(f"ElevenLabs request error: {e}")
        except TTSError:
            raise
        except Exception as e:
            logger.exception("ElevenLabs unexpected error")
            raise TTSError(f"TTS error: {e}")
