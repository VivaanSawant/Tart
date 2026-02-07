"""
Voice betting tracker: Whisper (STT) + pyannote (speaker diarization).

Listens for phrases like "raise 50", "call", "fold", "check", "all in" and tracks
which player said what, in table order.

Usage:
  - Process a WAV file:
      tracker = VoiceBettingTracker()
      events = tracker.process_audio_file("recording.wav")
  - Or use as a script:
      python voice_betting_tracker.py path/to/audio.wav

Requires:
  - pip install faster-whisper pyannote.audio torch
  - Hugging Face token for pyannote (accept license at https://huggingface.co/pyannote/speaker-diarization-3.1)
  - Set env HUGGINGFACE_HUB_TOKEN or pass hf_token= to VoiceBettingTracker()
"""

from __future__ import annotations

import re
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# -----------------------------------------------------------------------------
# Action parsing
# -----------------------------------------------------------------------------

ACTION_FOLD = "fold"
ACTION_CHECK = "check"
ACTION_CALL = "call"
ACTION_BET = "bet"
ACTION_RAISE = "raise"
ACTION_ALL_IN = "all_in"

# Spoken number words (for "raise fifty", "bet twenty"); longer phrases first
_WORD_NUMS_ORDERED = [
    ("twenty five", 25), ("twentyfive", 25),
    ("twenty", 20), ("thirty", 30), ("forty", 40), ("fifty", 50),
    ("sixty", 60), ("seventy", 70), ("eighty", 80), ("ninety", 90), ("hundred", 100),
]

# (regex, action_name, amount_mode: False | True=use group(1) as float | int=fixed amount)
_ACTION_PATTERNS: list[tuple] = [
    (re.compile(r"\b(all\s*in|allin)\b", re.I), ACTION_ALL_IN, False),
    (re.compile(r"\bfold\b", re.I), ACTION_FOLD, False),
    (re.compile(r"\bcheck\b", re.I), ACTION_CHECK, False),
    (re.compile(r"\bcall\b", re.I), ACTION_CALL, False),
    (re.compile(r"\braise\s+(\d+(?:\.\d+)?)\b", re.I), ACTION_RAISE, True),
    (re.compile(r"\braise\s+to\s+(\d+(?:\.\d+)?)\b", re.I), ACTION_RAISE, True),
    (re.compile(r"\bbet\s+(\d+(?:\.\d+)?)\b", re.I), ACTION_BET, True),
    (re.compile(r"\bbet\s+(\d+(?:\.\d+)?)\s*(?:dollars?|bucks|bb)?\b", re.I), ACTION_BET, True),
]
for word, num in _WORD_NUMS_ORDERED:
    _ACTION_PATTERNS.append((re.compile(r"\braise\s+" + re.escape(word) + r"\b", re.I), ACTION_RAISE, num))
    _ACTION_PATTERNS.append((re.compile(r"\bbet\s+" + re.escape(word) + r"\b", re.I), ACTION_BET, num))


@dataclass
class BettingAction:
    """A single voice-detected betting action."""
    player_index: int   # 0 = first speaker, 1 = second, etc. (table order)
    speaker_id: str    # Raw diarization label (e.g. "SPEAKER_00")
    action: str        # fold | check | call | bet | raise | all_in
    amount: Optional[float] = None
    raw_text: str = ""
    start_time: float = 0.0
    end_time: float = 0.0


def parse_betting_phrase(text: str) -> Optional[tuple[str, Optional[float]]]:
    """
    Parse a phrase into (action, amount) or None if no betting action found.
    Returns first matching action in the text. Handles digits and words like "fifty".
    """
    if not text or not text.strip():
        return None
    text = " " + text.strip() + " "
    for pattern, action, amount_mode in _ACTION_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        amount = None
        if amount_mode is True and m.lastindex:
            try:
                amount = float(m.group(1))
            except (ValueError, IndexError):
                pass
        elif isinstance(amount_mode, (int, float)):
            amount = float(amount_mode)
        return (action, amount)
    return None


# -----------------------------------------------------------------------------
# Diarization + transcription pipeline
# -----------------------------------------------------------------------------

def _align_segment_to_speaker(seg_start: float, seg_end: float, diar_segments: list[tuple[str, float, float]]) -> Optional[str]:
    """Return the speaker id that has the largest overlap with [seg_start, seg_end]."""
    best_speaker = None
    best_overlap = 0.0
    for spk, d_start, d_end in diar_segments:
        overlap = max(0, min(seg_end, d_end) - max(seg_start, d_start))
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = spk
    return best_speaker


@dataclass
class VoiceBettingTracker:
    """
    Tracks betting actions from voice: diarization (who spoke when) + Whisper (what they said).
    Maps speakers to player index by order of first appearance (table order).
    """

    hf_token: Optional[str] = None
    whisper_model_size: str = "base"
    whisper_device: str = "auto"
    whisper_compute_type: str = "float32"

    _diarization_pipeline = None
    _whisper_model = None

    def _get_diarization_pipeline(self):
        if self._diarization_pipeline is None:
            try:
                from pyannote.audio import Pipeline
            except ImportError as e:
                raise ImportError(
                    "pyannote.audio is required. Install with: pip install pyannote.audio"
                ) from e
            token = self.hf_token or os.environ.get("HUGGINGFACE_HUB_TOKEN")
            if not token:
                raise ValueError(
                    "Hugging Face token required for pyannote. "
                    "Set HUGGINGFACE_HUB_TOKEN or pass hf_token= to VoiceBettingTracker(). "
                    "Accept license: https://huggingface.co/pyannote/speaker-diarization-3.1"
                )
            try:
                self._diarization_pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=token,
                )
            except TypeError:
                self._diarization_pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    token=token,
                )
        return self._diarization_pipeline

    def _get_whisper_model(self):
        if self._whisper_model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as e:
                raise ImportError(
                    "faster-whisper is required. Install with: pip install faster-whisper"
                ) from e
            self._whisper_model = WhisperModel(
                self.whisper_model_size,
                device=self.whisper_device,
                compute_type=self.whisper_compute_type,
            )
        return self._whisper_model

    def diarize(self, audio_path: str) -> list[tuple[str, float, float]]:
        """
        Run speaker diarization on the audio file.
        Returns list of (speaker_id, start_sec, end_sec).
        """
        pipeline = self._get_diarization_pipeline()
        diar = pipeline(audio_path)
        segments = []
        for segment, _, label in diar.itertracks(yield_label=True):
            segments.append((label, float(segment.start), float(segment.end)))
        return segments

    def transcribe_with_timestamps(self, audio_path: str) -> list[tuple[float, float, str]]:
        """
        Transcribe audio and return segments with (start_sec, end_sec, text).
        Uses language="en" for more reliable short clips; set to None for auto-detect.
        """
        model = self._get_whisper_model()
        segments_out = []
        # language="en" helps short clips; avoids wrong auto-detect
        segments, _ = model.transcribe(
            audio_path,
            word_timestamps=False,
            language="en",
            vad_filter=True,
        )
        for seg in segments:
            if seg.text and seg.text.strip():
                segments_out.append((seg.start, seg.end, seg.text.strip()))
        return segments_out

    def process_audio_file(
        self,
        audio_path: str,
        *,
        num_players: Optional[int] = None,
    ) -> list[BettingAction]:
        """
        Run diarization + transcription on an audio file, parse betting phrases,
        and return a list of BettingAction in time order. Speakers are mapped to
        player_index by order of first speech (0 = first speaker, 1 = second, etc.).
        """
        audio_path = str(Path(audio_path).resolve())
        if not os.path.isfile(audio_path):
            raise FileNotFoundError(audio_path)

        diar_segments = self.diarize(audio_path)
        transcribe_segments = self.transcribe_with_timestamps(audio_path)

        # Map each transcript segment to a speaker
        speaker_order: list[str] = []
        seen: set[str] = set()

        def speaker_to_player(speaker_id: str) -> int:
            if speaker_id not in seen:
                seen.add(speaker_id)
                speaker_order.append(speaker_id)
            return speaker_order.index(speaker_id)

        actions: list[BettingAction] = []
        for start, end, text in transcribe_segments:
            speaker = _align_segment_to_speaker(start, end, diar_segments)
            if speaker is None:
                continue
            parsed = parse_betting_phrase(text)
            if parsed is None:
                continue
            action_name, amount = parsed
            player_idx = speaker_to_player(speaker)
            if num_players is not None and player_idx >= num_players:
                continue
            actions.append(
                BettingAction(
                    player_index=player_idx,
                    speaker_id=speaker,
                    action=action_name,
                    amount=amount,
                    raw_text=text,
                    start_time=start,
                    end_time=end,
                )
            )

        return actions

    def get_speaker_to_player_map(self, audio_path: str) -> dict[str, int]:
        """
        Run full pipeline and return mapping speaker_id -> player_index (table order).
        Useful if you want to label speakers once and reuse.
        """
        actions = self.process_audio_file(audio_path)
        mapping = {}
        for a in actions:
            if a.speaker_id not in mapping:
                mapping[a.speaker_id] = a.player_index
        return mapping

    def process_audio_chunk(self, audio_path: str) -> tuple[list[BettingAction], str]:
        """
        Real-time chunk: Whisper only (no diarization). Use for live mic streams.
        Returns (betting_actions, full_transcript). Actions have player_index=0, speaker_id="live".
        """
        segments = self.transcribe_with_timestamps(audio_path)
        transcript_parts: list[str] = []
        actions: list[BettingAction] = []
        for start, end, text in segments:
            transcript_parts.append(text)
            parsed = parse_betting_phrase(text)
            if parsed is None:
                continue
            action_name, amount = parsed
            actions.append(
                BettingAction(
                    player_index=0,
                    speaker_id="live",
                    action=action_name,
                    amount=amount,
                    raw_text=text,
                    start_time=start,
                    end_time=end,
                )
            )
        transcript = " ".join(transcript_parts).strip() if transcript_parts else ""
        return actions, transcript


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Voice betting tracker (Whisper + pyannote)")
    parser.add_argument("audio", help="Path to WAV (or supported) audio file")
    parser.add_argument("-n", "--num-players", type=int, default=None, help="Max player index to report (0..n-1)")
    parser.add_argument("--whisper", default="base", help="Whisper model size: tiny, base, small, medium, large-v3")
    args = parser.parse_args()

    tracker = VoiceBettingTracker(whisper_model_size=args.whisper)
    events = tracker.process_audio_file(args.audio, num_players=args.num_players)

    print(f"Found {len(events)} betting action(s):")
    for a in events:
        amt = f" ${a.amount}" if a.amount is not None else ""
        print(f"  Player {a.player_index} ({a.speaker_id}): {a.action}{amt}  — \"{a.raw_text}\"")


if __name__ == "__main__":
    main()
