"""
Dedalus Labs audio transcription client.

Uses the Dedalus API (https://api.dedaluslabs.ai/v1/audio/transcriptions)
to transcribe audio files via OpenAI's Whisper model.

Set DEDALUS_API_KEY in the environment or pass api_key= to transcribe_audio().
"""

import os
import re
import requests

DEDALUS_API_URL = "https://api.dedaluslabs.ai/v1/audio/transcriptions"
DEDALUS_MODEL = "openai/whisper-1"

# Common Whisper hallucinations during silence — discard these
_HALLUCINATION_PATTERNS = [
    r"^\.+$",                        # just dots/periods
    r"^[,.\s]+$",                    # just punctuation
    r"^thank(s|\s+you)",             # "Thank you", "Thanks"
    r"^bye",                         # "Bye", "Bye-bye"
    r"^(thanks|thank you)\s+for\s+watching",
    r"^(thanks|thank you)\s+for\s+listening",
    r"^please\s+subscribe",
    r"^see\s+you",
    r"^voil[aà]",
    r"^(good|great)\s+(bye|night|morning)",
    r"^(hello|hi|hey)\b",
    r"^(okay|ok|right|alright|so|well|um|uh|hmm)\s*[.!]?\s*$",
    r"^you$",
    r"^the\s",
    r"^(of|and|the|a|an|in|to|for|is|it)\s+\w+[.!]?$",  # common filler fragments
    r"^colors?[.!]?\s*$",
    r"^(silence|music|applause)",
    r"^\[.*\]$",                     # bracketed descriptions like [music]
    r"^(i|we|he|she|they)\s+(don'?t|can'?t|won'?t|didn'?t)",  # negations = not commands
]
_HALLUCINATION_RES = [re.compile(p, re.IGNORECASE) for p in _HALLUCINATION_PATTERNS]


def _is_hallucination(text: str) -> bool:
    """Return True if text looks like a Whisper hallucination, not real speech."""
    t = text.strip()
    if len(t) < 3:
        return True
    if len(t.split()) > 8:
        return True  # real commands are short
    return any(r.search(t) for r in _HALLUCINATION_RES)


def transcribe_audio(
    file_path: str,
    *,
    api_key: str | None = None,
    language: str = "en",
    model: str = DEDALUS_MODEL,
    prompt: str | None = None,
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
        data = {"model": model, "language": language, "temperature": "0"}
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
    text = result.get("text", "").strip()
    if _is_hallucination(text):
        return ""
    return text


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python dedalus_client.py <audio_file>")
        print("Set DEDALUS_API_KEY in the environment first.")
        sys.exit(1)
    text = transcribe_audio(sys.argv[1])
    print(f"Transcript: {text}")
