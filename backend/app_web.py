"""
API backend for PokerPlaya: JSON endpoints and MJPEG video feed.
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
from flask import Flask, Response, jsonify, request
from ultralytics import YOLO

import card_logger
import equitypredict
import pot_calc

# Model configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
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
    return os.path.join(REPO_ROOT, filename)


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
                    confirmed = shared_state.get("betting_confirmed_up_to")
                    # Auto-lock hole: 2 cards stable 2s when we have no hole cards yet
                    if (
                        len(shared_state["locked_cards"]) < 2
                        and len(unknown_set) == 2
                    ):
                        shared_state["locked_cards"] = sorted(unknown_set)
                        shared_state["betting_confirmed_up_to"] = "hole"
                        shared_state["last_unknown_set"] = None
                        hand_updated = True
                    elif (
                        len(shared_state["flop_cards"]) < 3
                        and len(unknown_set) == 3
                        and len(shared_state["locked_cards"]) == 2
                        and confirmed in ("preflop", "flop", "turn", "river")
                    ):
                        shared_state["flop_cards"] = sorted(unknown_set)
                        shared_state["last_unknown_set"] = None
                        hand_updated = True
                    elif (
                        shared_state["turn_card"] is None
                        and len(unknown_set) == 1
                        and len(shared_state["flop_cards"]) == 3
                        and confirmed in ("flop", "turn", "river")
                    ):
                        shared_state["turn_card"] = next(iter(unknown_set))
                        shared_state["last_unknown_set"] = None
                        hand_updated = True
                    elif (
                        shared_state["river_card"] is None
                        and len(unknown_set) == 1
                        and shared_state["turn_card"] is not None
                        and confirmed in ("turn", "river")
                    ):
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


app = Flask(__name__)

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
    "pot_state": pot_calc.PotState(),
    "current_street": "flop",  # which street we're deciding on: preflop, flop, turn, river
    "betting_confirmed_up_to": None,  # None | "hole" | "preflop" | "flop" | "turn" | "river"
}
stop_event = threading.Event()


@app.route("/health")
def health():
    return jsonify({"ok": True})


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
    analysis = equitypredict.compute_full_analysis(card_logger.LOG_FILE)
    equity_flop = analysis["equity_flop"]
    equity_turn = analysis["equity_turn"]
    equity_river = analysis["equity_river"]
    bet_recommendations = analysis["bet_recommendations"]
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

    # Pending betting: which street must be confirmed before scanning for next cards
    with shared_state["lock"]:
        confirmed = shared_state.get("betting_confirmed_up_to")
    n_hole, n_flop = len(hole), len(flop)
    has_turn, has_river = turn is not None, river is not None
    if n_hole == 2 and n_flop == 0 and confirmed in (None, "hole"):
        pending_betting_street = "preflop"
    elif n_flop == 3 and not has_turn and confirmed == "preflop":
        pending_betting_street = "flop"
    elif has_turn and not has_river and confirmed == "flop":
        pending_betting_street = "turn"
    elif has_river and confirmed == "turn":
        pending_betting_street = "river"
    else:
        pending_betting_street = None

    # Pot odds: use current street and pot state for recommendation
    with shared_state["lock"]:
        pot_state = shared_state["pot_state"]
        current_street = shared_state["current_street"]
    equity_for_street = pot_calc.get_equity_for_street(
        current_street,
        equity_flop,
        equity_turn,
        equity_river,
        equity_preflop=analysis.get("equity_preflop"),
    )
    to_call = pot_state.amount_to_call(current_street)
    required_equity = pot_state.required_equity_pct(current_street)
    verdict, reason = pot_calc.recommendation(
        equity_for_street, current_street, pot_state
    )

    return jsonify({
        "hole_cards": hole,
        "flop_cards": flop,
        "turn_card": turn,
        "river_card": river,
        "available_cards": available,
        "pending_betting_street": pending_betting_street,
        "equity_preflop": analysis.get("equity_preflop"),
        "equity_flop": equity_flop,
        "equity_turn": equity_turn,
        "equity_river": equity_river,
        "equity_error": equity_error,
        "bet_recommendations": bet_recommendations,
        "pot": {
            "state": pot_state.to_dict(),
            "current_street": current_street,
            "pot_before_call": pot_state.pot_before_our_call(current_street),
            "to_call": to_call,
            "required_equity_pct": required_equity,
            "recommendation": verdict,
            "recommendation_reason": reason,
        },
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
            if len(hole) == 2:
                shared_state["betting_confirmed_up_to"] = "hole"
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
        if len(shared_state["locked_cards"]) == 2:
            shared_state["betting_confirmed_up_to"] = "hole"
    persist_hand_state(shared_state)
    return jsonify({"ok": True, "locked": to_lock})


@app.route("/api/confirm_betting", methods=["POST"])
def api_confirm_betting():
    """
    Confirm betting for a street before scanning for the next cards.
    Body: { "street": "preflop"|"flop"|"turn"|"river", "opponent": number, "hero": number }
    Opponent/hero are total amount put in that street (0 = check).
    """
    data = request.get_json(force=True, silent=True) or {}
    street = data.get("street")
    if street not in pot_calc.STREETS:
        return jsonify({"ok": False, "error": "missing or invalid 'street'"}), 400
    opponent = float(data.get("opponent") or 0)
    hero = float(data.get("hero") or 0)
    with shared_state["lock"]:
        state = shared_state["pot_state"]
        state._bets(street)["opponent"] = opponent
        state._bets(street)["hero"] = hero
        shared_state["betting_confirmed_up_to"] = street
    return jsonify({"ok": True})


@app.route("/api/pot", methods=["GET"])
def api_pot_get():
    """Return current pot state and pot-odds info for the current decision street."""
    with shared_state["lock"]:
        pot_state = shared_state["pot_state"]
        current_street = shared_state["current_street"]
    to_call = pot_state.amount_to_call(current_street)
    required_equity = pot_state.required_equity_pct(current_street)
    return jsonify({
        "state": pot_state.to_dict(),
        "current_street": current_street,
        "pot_before_call": pot_state.pot_before_our_call(current_street),
        "to_call": to_call,
        "required_equity_pct": required_equity,
    })


@app.route("/api/pot", methods=["POST"])
def api_pot_post():
    """
    Update pot state and/or current decision street.
    Body: { "starting_pot"?, "preflop"?: { "opponent"?, "hero"? }, "flop"?, "turn"?, "river"?, "current_street"? }
    """
    data = request.get_json(force=True, silent=True) or {}
    with shared_state["lock"]:
        if "starting_pot" in data or any(s in data for s in pot_calc.STREETS):
            state = shared_state["pot_state"]
            if "starting_pot" in data:
                state.starting_pot = float(data.get("starting_pot") or 0)
            for street in pot_calc.STREETS:
                b = data.get(street)
                if isinstance(b, dict):
                    if "opponent" in b:
                        state._bets(street)["opponent"] = float(b.get("opponent") or 0)
                    if "hero" in b:
                        state._bets(street)["hero"] = float(b.get("hero") or 0)
        if "current_street" in data and data["current_street"] in pot_calc.STREETS:
            shared_state["current_street"] = data["current_street"]
    return jsonify({"ok": True})


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
        shared_state["pot_state"] = pot_calc.PotState()
        shared_state["current_street"] = "flop"
        shared_state["betting_confirmed_up_to"] = None
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
    print(f"Starting PokerPlaya backend (model: {MODEL_NAME})")
    print("API at http://127.0.0.1:5001")
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
