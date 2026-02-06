# PokerPlaya – Live card detection

Flask backend + React frontend for real-time card detection and hand tracking.

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
npm run dev
```

Open the Vite dev URL (typically `http://localhost:5173`) in your browser.

## Optional: Tk desktop UI

```bash
python backend/app.py
```

## Model file

The model file `yolov8m_synthetic.pt` remains in the repo root and is loaded by the backend.
