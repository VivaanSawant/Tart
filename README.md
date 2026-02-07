# Poker Psych

Poker Psych is a real-time behavioral analysis tool for poker players and psychiatrists. Using a phone’s camera and microphone, it tracks cards, betting patterns, and player behavior during live poker sessions to build statistical and psychological profiles of both you and your opponents.

Players use Poker Psych to improve decision-making and risk taking, while psychiatrists gain insight into behavioral tendencies under pressure. The platform features an LLM-powered Poker Coach, voice-controlled betting, and adaptive poker bots that exploit player weaknesses based on collected game data, as well as custom designed Ace cards featuring our beloved Scotty Dog.

All analysis and agent coordination are powered by a Daedalus MCP server, with a computer vision model handling live card detection and tracking.

# Setup Instructions

Flask backend + React frontend.

## Backend setup

```bash
python -m pip install -r backend/requirements.txt
```

## Run backend (API + video feed)

```bash
python backend/app_web.py
```

The backend serves JSON APIs and an MJPEG stream at `/video_feed`.

## Run frontend (React)

```bash
cd frontend
npm install
npm run dev -- --host
```

Open the Vite dev URL (typically `http://localhost:5173`) in your browser.

## Optional: Tk desktop UI

```bash
python backend/app.py
```

## Model file

The model file `yolov8m_synthetic.pt` remains in the repo root and is loaded by the backend.
