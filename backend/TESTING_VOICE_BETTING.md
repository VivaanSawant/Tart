# Testing the voice betting tracker

## 1. One-time setup

**Use the same Python that runs the app.** If you see "faster-whisper is required" even after installing, you likely ran `pip install` with a different Python. When you start the backend, it prints which Python it uses and whether voice deps are found. Install with that exact Python:

```bash
cd Tart/backend

# Install with the SAME python you use to run app_web.py (avoids "not found" errors)
python -m pip install -r requirements-voice.txt
# Or if you use python3:
python3 -m pip install -r requirements-voice.txt

# Hugging Face token (required for pyannote diarization)
# 1. Sign up at https://huggingface.co
# 2. Accept the license: https://huggingface.co/pyannote/speaker-diarization-3.1
# 3. Create a token: https://huggingface.co/settings/tokens
# 4. Set it (replace YOUR_TOKEN with your actual token):

export HUGGINGFACE_HUB_TOKEN=YOUR_TOKEN

# On Windows (PowerShell):
# $env:HUGGINGFACE_HUB_TOKEN = "YOUR_TOKEN"
```

## 2. Test from the command line (no frontend)

Use an audio file where someone says things like "call", "raise 50", "fold", "check".

```bash
cd Tart/backend

# Optional: use a smaller/faster Whisper model for testing (tiny, base, small, medium, large-v3)
python voice_betting_tracker.py path/to/your_audio.wav --whisper base

# Limit to first N players (e.g. 6-max table)
python voice_betting_tracker.py path/to/audio.wav -n 6
```

Example output:

```
Found 3 betting action(s):
  Player 0 (SPEAKER_00): call  — "I'll call"
  Player 1 (SPEAKER_01): raise 50.0  — "raise fifty"
  Player 0 (SPEAKER_00): fold  — "fold"
```

## 3. Test via the website

1. **Start the backend** (from repo root or `Tart/`):

   ```bash
   cd Tart/backend
   export HUGGINGFACE_HUB_TOKEN=YOUR_TOKEN   # if not already set
   python app_web.py
   ```

2. **Start the frontend** (in another terminal):

   ```bash
   cd Tart/frontend
   npm install
   npm run dev
   ```

3. Open the app in the browser (e.g. http://localhost:5173).

4. In the sidebar, find **Voice betting**. If you see install instructions, the voice stack isn’t loaded (check `HUGGINGFACE_HUB_TOKEN` and that you’re in the same env where you ran `pip install -r requirements-voice.txt`).

5. **Real-time (no file):** Click **Start listening**, allow mic access, then say "call", "raise fifty", "fold", etc. Every ~3 seconds a chunk is sent and any detected actions appear. Click **Stop listening** when done. No recording is saved to disk.

6. **Upload a file:** Click **Upload audio**, choose a WAV/MP3 (or other supported format) where people say "call", "raise 50", "fold", etc. Wait for processing; the list of detected actions should appear below.

## 4. Getting test audio

- **Record yourself:** Use Voice Memos (Mac/iPhone), QuickTime (Mac), or any recorder. Say e.g. “Call” then “Raise fifty” then “Fold” in a quiet room. Export as WAV or MP3.
- **Two speakers:** Record two people (or yourself twice) saying different actions so you can confirm player 0 vs player 1.
- **Length:** 10–30 seconds is enough; longer files take more time (Whisper + diarization).

## 5. Troubleshooting

**Live status (betting modal):** Under the "Listen" button, a status line tells you what’s happening: "Listening…", "Sending chunk (X KB)…", "Heard: …", "No speech in last chunk", or "Error: …". Use it to see whether the mic is sending, the server is replying, or transcription is empty.

| Issue | What to check |
|-------|----------------|
| **Server receives audio but no text** | Whisper got the audio but returned no speech. Try: (1) **Speak in English** clearly, (2) **Closer to the mic**, (3) **Install ffmpeg** so webm decodes properly: `brew install ffmpeg` (Mac), (4) Use **Upload audio** with a WAV file to test if it’s a webm vs WAV issue. |
| Error mentions ffmpeg or decode | Browser sends webm; server needs ffmpeg. Install: `brew install ffmpeg` (Mac) or your system’s ffmpeg package. |
| `Voice betting not installed` in UI | Backend started without voice deps or without `HUGGINGFACE_HUB_TOKEN`. Install deps, set token, restart backend. |
| `401` or auth error from pyannote | Accept the model license at the Hugging Face link above; use a token that has access. |
| No actions detected | Speak clearly; avoid heavy noise. Try “call”, “raise fifty”, “fold” and check the file plays in a normal player. |
| Wrong player order | Players are assigned by order of first speech (first speaker = Player 0). Record in the order you want, or ignore and use speaker_id. |
