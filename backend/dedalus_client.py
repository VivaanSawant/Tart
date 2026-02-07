"""
Dedalus Labs audio transcription client.

Uses the Dedalus API (https://api.dedaluslabs.ai/v1/audio/transcriptions)
to transcribe audio files via OpenAI's Whisper model.

Set DEDALUS_API_KEY in the environment or pass api_key= to transcribe_audio().
"""

import os
import requests

DEDALUS_API_URL = "https://api.dedaluslabs.ai/v1/audio/transcriptions"
DEDALUS_MODEL = "openai/whisper-1"


def transcribe_audio(
    file_path: str,
    *,
    api_key: str | None = None,
    language: str = "en",
    model: str = DEDALUS_MODEL,
    prompt: str | None = "call, fold, check, raise, all in, cents, dollars",
) -> str:
    """
    Transcribe an audio file using Dedalus Labs API.

    Args:
        file_path: Path to audio file (wav, webm, mp3, m4a, etc.)
        api_key: Dedalus API key (or set DEDALUS_API_KEY env var)
        language: ISO-639-1 language code (default "en")
        model: Model ID (default "openai/whisper-1")
        prompt: Hint text to improve accuracy for poker terms

    Returns:
        Transcribed text string.

    Raises:
        ValueError: If no API key is provided.
        requests.HTTPError: If the API returns an error.
    """
    key = api_key or os.environ.get("DEDALUS_API_KEY")
    if not key:
        raise ValueError(
            "DEDALUS_API_KEY not set. Set it in the environment or pass api_key=."
        )

    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f)}
        data = {"model": model, "language": language}
        if prompt:
            data["prompt"] = prompt

        resp = requests.post(
            DEDALUS_API_URL,
            headers={"Authorization": f"Bearer {key}"},
            files=files,
            data=data,
            timeout=30,
        )

    resp.raise_for_status()
    result = resp.json()
    return result.get("text", "")


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python dedalus_client.py <audio_file>")
        print("Set DEDALUS_API_KEY in the environment first.")
        sys.exit(1)
    text = transcribe_audio(sys.argv[1])
    print(f"Transcript: {text}")
