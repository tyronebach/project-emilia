"""
ElevenLabs TTS service.
Uses the with-timestamps REST API to get character-level alignment data.
"""
import base64
import httpx
from config import settings
from core.exceptions import TTSError, bad_request


class ElevenLabsService:
    """Client for ElevenLabs TTS API."""

    @staticmethod
    async def synthesize(
        text: str,
        voice_id: str | None = None
    ) -> dict:
        """
        Synthesize speech from text using ElevenLabs with-timestamps API.

        Args:
            text: Text to synthesize
            voice_id: Optional voice ID override

        Returns:
            Dict with audio_base64, alignment, voice_id, duration_estimate

        Raises:
            TTSError: If TTS request fails
        """
        if not settings.elevenlabs_api_key:
            raise TTSError("TTS not configured - missing API key")

        voice_id = voice_id or settings.elevenlabs_voice_id
        text = text.strip()

        if not text:
            raise bad_request("Empty text")

        # Use the with-timestamps endpoint for alignment data
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"

        headers = {
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json",
        }

        payload = {
            "text": text,
            "model_id": settings.elevenlabs_model,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code != 200:
                    error_text = response.text
                    raise TTSError(f"ElevenLabs API error: {response.status_code} - {error_text[:200]}")
                
                data = response.json()
                
                # Debug: log response structure to stderr (shows in docker logs)
                import sys
                print(f"[ElevenLabs] Response keys: {list(data.keys())}", file=sys.stderr, flush=True)
                
                audio_base64 = data.get("audio_base64", "")
                if not audio_base64:
                    raise TTSError("No audio in response")
                
                # Extract alignment data
                alignment = data.get("alignment") or data.get("normalized_alignment")
                transformed_alignment = None
                
                if alignment:
                    print(f"[ElevenLabs] Alignment keys: {list(alignment.keys())}", file=sys.stderr, flush=True)
                    
                    # Handle ElevenLabs response format
                    chars = alignment.get("characters", [])
                    start_times = alignment.get("character_start_times_seconds", [])
                    end_times = alignment.get("character_end_times_seconds", [])
                    
                    if chars and start_times and end_times:
                        # Convert to ms and calculate durations
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
                        print(f"[ElevenLabs] Transformed {len(chars)} characters with timing", file=sys.stderr, flush=True)
                else:
                    print("[ElevenLabs] No alignment data in response", file=sys.stderr, flush=True)

                # Estimate duration from audio size (rough)
                audio_bytes = base64.b64decode(audio_base64)
                duration_estimate = len(audio_bytes) / (44100 * 2 / 8)

                return {
                    "audio_base64": audio_base64,
                    "alignment": transformed_alignment,
                    "voice_id": voice_id,
                    "duration_estimate": duration_estimate
                }

        except httpx.RequestError as e:
            import sys
            print(f"[ElevenLabs] Request error: {e}", file=sys.stderr, flush=True)
            raise TTSError(f"ElevenLabs request error: {e}")
        except Exception as e:
            import sys
            print(f"[ElevenLabs] Exception: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc(file=sys.stderr)
            if isinstance(e, TTSError):
                raise
            raise TTSError(f"TTS error: {str(e)}")
