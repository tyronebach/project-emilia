"""
ElevenLabs TTS service.
"""
import asyncio
import base64
import json
import websockets
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
        Synthesize speech from text using ElevenLabs WebSocket API.

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

        ws_url = (
            f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
            f"?model_id={settings.elevenlabs_model}&output_format=mp3_44100_128"
        )

        try:
            audio_chunks = []
            alignment_data = None

            async with websockets.connect(
                ws_url,
                additional_headers={"xi-api-key": settings.elevenlabs_api_key}
            ) as ws:
                # Send initial config
                await ws.send(json.dumps({
                    "text": " ",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                    "generation_config": {"chunk_length_schedule": [120, 160, 250, 290]},
                    "xi_api_key": settings.elevenlabs_api_key
                }))

                # Send text with alignment request
                await ws.send(json.dumps({
                    "text": text,
                    "try_trigger_generation": True,
                    "flush": True,
                    "alignment": True
                }))

                await ws.send(json.dumps({"text": ""}))

                # Receive audio
                while True:
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=30.0)
                        data = json.loads(msg)

                        if data.get("audio"):
                            audio_chunks.append(base64.b64decode(data["audio"]))

                        if data.get("alignment"):
                            alignment_data = data["alignment"]

                        if data.get("isFinal"):
                            break

                    except asyncio.TimeoutError:
                        break

            if not audio_chunks:
                raise TTSError("No audio generated")

            audio_bytes = b"".join(audio_chunks)
            audio_base64 = base64.b64encode(audio_bytes).decode()

            # Transform alignment data to frontend format
            transformed_alignment = None
            if alignment_data:
                chars = alignment_data.get("characters", [])
                start_times = alignment_data.get("character_start_times_seconds", [])
                end_times = alignment_data.get("character_end_times_seconds", [])
                
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

            return {
                "audio_base64": audio_base64,
                "alignment": transformed_alignment,
                "voice_id": voice_id,
                "duration_estimate": len(audio_bytes) / (44100 * 2 / 8)
            }

        except websockets.exceptions.WebSocketException as e:
            raise TTSError(f"TTS WebSocket error: {e}")
        except Exception as e:
            if isinstance(e, TTSError):
                raise
            raise TTSError(f"TTS error: {str(e)}")
