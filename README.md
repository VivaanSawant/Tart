# PokerPlaya – Live card detection

Webcam app that runs one of four YOLOv8 models to detect playing cards in real time.

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

1. A **control window** opens with a dropdown to pick the model.
2. A **video window** opens with your webcam feed and bounding boxes + labels for detected cards.
3. Change the model anytime from the dropdown.
4. Press **Q** in the video window (or close the control window) to quit.

## Models

| Option | File | Use case |
|--------|------|----------|
| YOLOv8s Playing Cards | `yolov8s_playing_cards.pt` | Playing-card–specific (recommended for cards) |
| YOLOv8m Base | `yolov8m.pt` | General base model |
| YOLOv8m Synthetic | `yolov8m_synthetic.pt` | Trained on synthetic data |
| YOLOv8m Tuned | `yolov8m_tuned.pt` | Fine-tuned model |

Labels shown on screen come from each model’s class names (e.g. card names if the model was trained with them).
