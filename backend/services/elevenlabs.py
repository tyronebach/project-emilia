"""ElevenLabs TTS service with alignment data for lip sync."""
import logging
import base64
import httpx
from config import settings
from core.exceptions import TTSError

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
        text = text.strip()
        if not text:
            raise TTSError("Empty text")

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
        headers = {
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": settings.elevenlabs_model,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
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
                    duration_estimate = len(text) / 12.0

                return {
                    "audio_base64": audio_base64,
                    "alignment": transformed_alignment,
                    "voice_id": voice_id,
                    "duration_estimate": duration_estimate
                }

        except httpx.RequestError as e:
            logger.error("ElevenLabs request error: %s", e)
            raise TTSError(f"ElevenLabs request error: {e}")
        except TTSError:
            raise
        except Exception as e:
            logger.exception("ElevenLabs unexpected error")
            raise TTSError(f"TTS error: {e}")
