"""
Speech-to-text service.
"""
import httpx
from config import settings
from core.exceptions import STTError, timeout_error, service_unavailable


class STTService:
    """Client for Speech-to-Text service."""

    @staticmethod
    async def transcribe(audio_data: bytes, filename: str, content_type: str) -> dict:
        """
        Transcribe audio to text.

        Args:
            audio_data: Audio file bytes
            filename: Original filename
            content_type: MIME type of audio

        Returns:
            Dict with transcription result (text, language, duration, etc.)

        Raises:
            STTError: If transcription fails
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{settings.stt_service_url}/transcribe",
                    files={"audio": (filename, audio_data, content_type)}
                )

                if response.status_code != 200:
                    raise STTError(f"STT service returned {response.status_code}")

                return response.json()

        except httpx.TimeoutException:
            raise timeout_error("STT")
        except httpx.ConnectError:
            raise service_unavailable("STT")
        except Exception as e:
            if isinstance(e, STTError):
                raise
            raise STTError(f"STT error: {str(e)}")
