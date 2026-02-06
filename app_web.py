"""
Web interface for PokerPlaya: HTML UI with click-to-lock hole cards.
Flop (3 cards), turn (1), and river (1) auto-lock when stable for 2 seconds.
"""

import json
import os
import sys
import threading
import time

try:
    import omegaconf  # noqa: F401
except ImportError:
    print("Missing dependency: omegaconf")
    print("Run:  python -m pip install omegaconf")
    sys.exit(1)

import cv2
from flask import Flask, Response, jsonify, request, render_template
from ultralytics import YOLO

import card_logger
import equitypredict

# Model configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = "yolov8m_synthetic.pt"
MODEL_NAME = "YOLOv8m Synthetic"
STABILITY_SECONDS = 2.0

# Shared card state file for multiple developers (hole, flop, turn, river)
HAND_STATE_FILE = os.path.join(SCRIPT_DIR, "current_hand.json")

# Empty card state (cleared on restart and on "Clear hand")
EMPTY_HAND_STATE = {
    "hole_cards": [],
    "flop_cards": [],
    "turn_card": None,
    "river_card": None,
}


def get_model_path(filename: str) -> str:
    return os.path.join(SCRIPT_DIR, filename)


def write_hand_state_to_file(data: dict) -> None:
    """Write card state dict to HAND_STATE_FILE (real-time shared state for devs)."""
    with open(HAND_STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def clear_hand_state_file() -> None:
    """Clear the card state file (on program start and when user clears hand)."""
    write_hand_state_to_file(EMPTY_HAND_STATE.copy())


def persist_hand_state(state: dict) -> None:
    """Log current hole, flop, turn, river to HAND_STATE_FILE in real time."""
    with state["lock"]:
        data = {
            "hole_cards": list(state["locked_cards"]),
            "flop_cards": list(state["flop_cards"]),
            "turn_card": state["turn_card"],
            "river_card": state["river_card"],
        }
    write_hand_state_to_file(data)


def get_all_known_cards(shared_state: dict) -> tuple[set[str], dict[str, str]]:
    """Returns (set of all locked card names, dict of card -> 'hole'|'flop'|'turn'|'river')."""
    with shared_state["lock"]:
        hole = set(shared_state["locked_cards"])
        flop = set(shared_state["flop_cards"])
        turn = {shared_state["turn_card"]} if shared_state["turn_card"] else set()
        river = {shared_state["river_card"]} if shared_state["river_card"] else set()
    known = hole | flop | turn | river
    category = {}
    for c in hole:
        category[c] = "hole"
    for c in flop:
        category[c] = "flop"
    for c in turn:
        category[c] = "turn"
    for c in river:
        category[c] = "river"
    return known, category


def run_webcam_worker(shared_state: dict, stop_event: threading.Event):
    """Background thread: webcam + YOLO, update shared state; auto-lock flop/turn/river after 2s stable."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    model_path = get_model_path(MODEL_FILE)
    model = YOLO(model_path)

    try:
        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                break

            results = model(frame, verbose=False)
            names = model.names
            cards_this_frame: list[str] = []

            with shared_state["lock"]:
                hole = set(shared_state["locked_cards"])
                flop = set(shared_state["flop_cards"])
                turn = shared_state["turn_card"]
                river = shared_state["river_card"]

            known = hole | flop | set()
            if turn:
                known.add(turn)
            if river:
                known.add(river)

            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    label = names.get(cls_id, f"class_{cls_id}")
                    cards_this_frame.append(label)

            detected_set = set(cards_this_frame)
            unknown_set = detected_set - known
            now = time.monotonic()

            hand_updated = False
            with shared_state["lock"]:
                shared_state["detected_cards"] = list(detected_set)
                last_unknown_set = shared_state["last_unknown_set"]
                last_unknown_time = shared_state["last_unknown_time"]

                if unknown_set != last_unknown_set:
                    shared_state["last_unknown_set"] = unknown_set
                    shared_state["last_unknown_time"] = now
                elif (now - last_unknown_time) >= STABILITY_SECONDS:
                    if len(shared_state["flop_cards"]) < 3 and len(unknown_set) == 3:
                        shared_state["flop_cards"] = sorted(unknown_set)
                        shared_state["last_unknown_set"] = None
                        hand_updated = True
                    elif shared_state["turn_card"] is None and len(unknown_set) == 1:
                        shared_state["turn_card"] = next(iter(unknown_set))
                        shared_state["last_unknown_set"] = None
                        hand_updated = True
                    elif shared_state["river_card"] is None and len(unknown_set) == 1:
                        shared_state["river_card"] = next(iter(unknown_set))
                        shared_state["last_unknown_set"] = None
                        hand_updated = True
            if hand_updated:
                persist_hand_state(shared_state)

            # Draw boxes for MJPEG
            known_cards, category = get_all_known_cards(shared_state)
            for r in results:
                for box in r.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    label = names.get(cls_id, f"class_{cls_id}")
                    text = f"{label} {conf:.2f}"

                    if label in known_cards:
                        cat = category.get(label, "")
                        if cat == "hole":
                            color = (255, 165, 0)
                            tag = "HOLE"
                        elif cat == "flop":
                            color = (255, 0, 255)
                            tag = "FLOP"
                        elif cat == "turn":
                            color = (255, 255, 0)
                            tag = "TURN"
                        else:
                            color = (0, 255, 255)
                            tag = "RIVER"
                        label_text = f"[{tag}] {text}"
                    else:
                        color = (0, 255, 0)
                        label_text = text

                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                    cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw, y1), color, -1)
                    cv2.putText(
                        frame, label_text, (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2
                    )

            with shared_state["lock"]:
                n_hole = len(shared_state["locked_cards"])
                n_flop = len(shared_state["flop_cards"])
                has_turn = 1 if shared_state["turn_card"] else 0
                has_river = 1 if shared_state["river_card"] else 0
            status = f"Hole:{n_hole}/2 Flop:{n_flop}/3 Turn:{has_turn} River:{has_river} | New:{len(unknown_set)}"
            cv2.putText(frame, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 2)

            _, jpeg = cv2.imencode(".jpg", frame)
            with shared_state["lock"]:
                shared_state["current_frame"] = jpeg.tobytes()

    finally:
        cap.release()
        stop_event.set()


app = Flask(__name__, static_folder=None, template_folder=os.path.join(SCRIPT_DIR, "templates"))

shared_state = {
    "detected_cards": [],
    "locked_cards": [],
    "flop_cards": [],
    "turn_card": None,
    "river_card": None,
    "current_frame": None,
    "last_unknown_set": None,
    "last_unknown_time": 0.0,
    "lock": threading.Lock(),
}
stop_event = threading.Event()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def api_state():
    with shared_state["lock"]:
        hole = list(shared_state["locked_cards"])
        flop = list(shared_state["flop_cards"])
        turn = shared_state["turn_card"]
        river = shared_state["river_card"]
        detected = list(shared_state["detected_cards"])
    known = set(hole) | set(flop) | ({turn} if turn else set()) | ({river} if river else set())
    available = [c for c in detected if c not in known]

    # card_logger writes state to card_log.json; equitypredict reads from it
    card_logger.log_cards_present(
        hole_cards=hole,
        flop_cards=flop,
        turn_card=turn,
        river_card=river,
        unknown_cards=available,
    )
    equity_flop, equity_turn, equity_river = equitypredict.compute_equities_from_log(
        card_logger.LOG_FILE
    )
    equity_ready = len(hole) == 2 and len(flop) == 3
    equity_error = None
    if equity_ready and equity_flop is None and equity_turn is None and equity_river is None:
        try:
            from treys import Card  # noqa: F401
        except ImportError:
            equity_error = "Run: pip install treys"

    card_logger.log_cards_present(
        hole_cards=hole,
        flop_cards=flop,
        turn_card=turn,
        river_card=river,
        unknown_cards=available,
        equity_flop=equity_flop,
        equity_turn=equity_turn,
        equity_river=equity_river,
    )

    return jsonify({
        "hole_cards": hole,
        "flop_cards": flop,
        "turn_card": turn,
        "river_card": river,
        "available_cards": available,
        "equity_flop": equity_flop,
        "equity_turn": equity_turn,
        "equity_river": equity_river,
        "equity_error": equity_error,
    })


@app.route("/api/lock_hole", methods=["POST"])
def api_lock_hole():
    data = request.get_json(force=True, silent=True) or {}
    card = data.get("card")
    if not card:
        return jsonify({"ok": False, "error": "missing 'card'"}), 400
    with shared_state["lock"]:
        hole = shared_state["locked_cards"]
        if card in hole:
            hole.remove(card)
            action = "removed"
        elif len(hole) >= 2:
            return jsonify({"ok": False, "error": "hole already has 2 cards"}), 400
        else:
            if card in shared_state["flop_cards"]:
                shared_state["flop_cards"].remove(card)
            if shared_state["turn_card"] == card:
                shared_state["turn_card"] = None
            if shared_state["river_card"] == card:
                shared_state["river_card"] = None
            hole.append(card)
            action = "locked"
    persist_hand_state(shared_state)
    return jsonify({"ok": True, "action": action})


@app.route("/api/lock_hole_all", methods=["POST"])
def api_lock_hole_all():
    """Lock current available cards as hole in one click (up to 2)."""
    with shared_state["lock"]:
        hole = shared_state["locked_cards"]
        if len(hole) >= 2:
            return jsonify({"ok": False, "error": "hole already has 2 cards"}), 400
        known = set(shared_state["flop_cards"])
        known.add(shared_state["turn_card"] or "")
        known.add(shared_state["river_card"] or "")
        known.discard("")
        available = [c for c in shared_state["detected_cards"] if c not in known]
        to_lock = [c for c in available if c not in hole][: 2 - len(hole)]
        for card in to_lock:
            if card in shared_state["flop_cards"]:
                shared_state["flop_cards"].remove(card)
            if shared_state["turn_card"] == card:
                shared_state["turn_card"] = None
            if shared_state["river_card"] == card:
                shared_state["river_card"] = None
            hole.append(card)
    persist_hand_state(shared_state)
    return jsonify({"ok": True, "locked": to_lock})


@app.route("/api/clear", methods=["POST"])
def api_clear():
    """Full hand restart: clear all cards, reset stability timer, clear card state file."""
    with shared_state["lock"]:
        shared_state["locked_cards"].clear()
        shared_state["flop_cards"].clear()
        shared_state["turn_card"] = None
        shared_state["river_card"] = None
        shared_state["last_unknown_set"] = None
        shared_state["last_unknown_time"] = 0.0
    clear_hand_state_file()
    equitypredict.clear_cache()
    return jsonify({"ok": True})


def generate_frames():
    while not stop_event.is_set():
        with shared_state["lock"]:
            frame_bytes = shared_state.get("current_frame")
        if frame_bytes:
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
        time.sleep(0.05)


@app.route("/video_feed")
def video_feed():
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


def main():
    print(f"Starting PokerPlaya web UI (model: {MODEL_NAME})")
    print("Open http://127.0.0.1:5001 in your browser.")
    card_logger.LOG_FILE = os.path.join(SCRIPT_DIR, "card_log.json")
    # Write initial empty state so card_log.json exists
    card_logger.log_cards_present(hole_cards=[], flop_cards=[], unknown_cards=[])
    clear_hand_state_file()  # clear card state on restart so devs see fresh state
    worker = threading.Thread(target=run_webcam_worker, args=(shared_state, stop_event), daemon=True)
    worker.start()
    try:
        app.run(host="0.0.0.0", port=5001, threaded=True, use_reloader=False)
    finally:
        stop_event.set()


if __name__ == "__main__":
    main()
