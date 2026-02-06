"""
Live webcam card detection using YOLOv8 model.
Detections are shown on the video feed. Users can lock cards as their hole cards.
"""

import os
import sys
import threading
import tkinter as tk
from tkinter import ttk

# Some .pt models need omegaconf when loading; fail early with a clear message
try:
    import omegaconf  # noqa: F401
except ImportError:
    print("Missing dependency: omegaconf")
    print("Run:  python -m pip install omegaconf")
    sys.exit(1)

import cv2
from ultralytics import YOLO

from card_logger import log_cards_present

# Model configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = "yolov8m_synthetic.pt"
MODEL_NAME = "YOLOv8m Synthetic"


def get_model_path(filename: str) -> str:
    return os.path.join(SCRIPT_DIR, filename)


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


def run_webcam(shared_state: dict, stop_event: threading.Event):
    """Runs in a background thread: captures webcam, runs YOLO, displays results."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    model_path = get_model_path(MODEL_FILE)
    model = YOLO(model_path)

    window_name = "PokerPlaya – Card detection"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)

    try:
        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                break

            results = model(frame, verbose=False)
            names = model.names
            cards_this_frame: list[str] = []

            # Get all known (locked) cards and their categories
            known_cards, category = get_all_known_cards(shared_state)

            # Draw boxes and labels
            for r in results:
                for box in r.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    label = names.get(cls_id, f"class_{cls_id}")
                    text = f"{label} {conf:.2f}"
                    cards_this_frame.append(label)

                    if label in known_cards:
                        cat = category.get(label, "")
                        if cat == "hole":
                            color = (255, 165, 0)   # Orange
                            tag = "HOLE"
                        elif cat == "flop":
                            color = (255, 0, 255)   # Magenta
                            tag = "FLOP"
                        elif cat == "turn":
                            color = (255, 255, 0)   # Cyan
                            tag = "TURN"
                        else:
                            color = (0, 255, 255)   # Yellow
                            tag = "RIVER"
                        label_text = f"[{tag}] {text}"
                    else:
                        color = (0, 255, 0)  # Green = not yet locked
                        label_text = text

                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                    cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw, y1), color, -1)
                    cv2.putText(
                        frame, label_text, (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2
                    )

            # Update detected cards in shared state
            with shared_state["lock"]:
                shared_state["detected_cards"] = list(set(cards_this_frame))

            # Only log cards we don't already know (ignore flop/turn/river/hole when still in view)
            unknown_cards = [c for c in cards_this_frame if c not in known_cards]
            with shared_state["lock"]:
                hole = list(shared_state["locked_cards"])
                flop = list(shared_state["flop_cards"])
                turn = shared_state["turn_card"]
                river = shared_state["river_card"]
            log_cards_present(
                hole_cards=hole,
                flop_cards=flop,
                turn_card=turn,
                river_card=river,
                unknown_cards=unknown_cards,
            )

            # Overlay status
            cv2.putText(
                frame, f"Model: {MODEL_NAME}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2
            )
            n_hole = len(shared_state["locked_cards"])
            n_flop = len(shared_state["flop_cards"])
            has_turn = 1 if shared_state["turn_card"] else 0
            has_river = 1 if shared_state["river_card"] else 0
            status_text = f"Hole:{n_hole}/2 Flop:{n_flop}/3 Turn:{has_turn} River:{has_river} | New:{len(set(unknown_cards))}"
            cv2.putText(
                frame, status_text, (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 2
            )
            
            cv2.putText(
                frame, "Close window to quit", (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 2
            )

            cv2.imshow(window_name, frame)
            
            # Check if window was closed
            if cv2.getWindowProperty(window_name, cv2.WND_PROP_VISIBLE) < 1:
                break
            
            # Also allow Q key to quit
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
        stop_event.set()


def create_card_management_window(shared_state: dict, stop_event: threading.Event):
    """Creates and manages the card locking UI window."""
    root = tk.Tk()
    root.title("PokerPlaya – Card Manager")
    root.resizable(False, False)

    # Lock mode: which slot we're filling when user clicks a detected card
    lock_mode = tk.StringVar(value="hole")

    # Header
    header_frame = ttk.Frame(root)
    header_frame.pack(pady=10, padx=10, fill=tk.X)
    ttk.Label(header_frame, text="Detected Cards", font=("", 12, "bold")).pack()
    ttk.Label(
        header_frame,
        text="Select lock target below, then click a card to lock it there. Already locked cards are ignored when logging.",
        font=("", 9),
    ).pack()

    # Lock target selector
    mode_frame = ttk.LabelFrame(root, text="Lock as", padding=5)
    mode_frame.pack(pady=5, padx=10, fill=tk.X)
    for value, label in [
        ("hole", "Hole (max 2)"),
        ("flop", "Flop (max 3)"),
        ("turn", "Turn (1)"),
        ("river", "River (1)"),
    ]:
        ttk.Radiobutton(mode_frame, text=label, variable=lock_mode, value=value).pack(
            side=tk.LEFT, padx=5
        )

    # Detected cards frame
    detected_frame = ttk.LabelFrame(root, text="Detected Cards – click to lock", padding=10)
    detected_frame.pack(pady=5, padx=10, fill=tk.BOTH, expand=True)

    # Locked sections
    hole_frame = ttk.LabelFrame(root, text="Your Hole Cards", padding=5)
    hole_frame.pack(pady=2, padx=10, fill=tk.X)
    flop_frame = ttk.LabelFrame(root, text="Flop", padding=5)
    flop_frame.pack(pady=2, padx=10, fill=tk.X)
    turn_frame = ttk.LabelFrame(root, text="Turn", padding=5)
    turn_frame.pack(pady=2, padx=10, fill=tk.X)
    river_frame = ttk.LabelFrame(root, text="River", padding=5)
    river_frame.pack(pady=2, padx=10, fill=tk.X)

    button_frame = ttk.Frame(root)
    button_frame.pack(pady=10, padx=10, fill=tk.X)

    card_buttons: dict[str, ttk.Button] = {}
    # Widgets showing locked cards (so we can destroy on clear/remove)
    hole_labels: list[ttk.Label] = []
    flop_labels: list[ttk.Label] = []
    turn_label_widget: ttk.Label | None = None
    river_label_widget: ttk.Label | None = None

    def redraw_locked_sections():
        """Rebuild hole/flop/turn/river display from shared state."""
        nonlocal turn_label_widget, river_label_widget
        for w in hole_labels:
            w.destroy()
        hole_labels.clear()
        for w in flop_labels:
            w.destroy()
        flop_labels.clear()
        if turn_label_widget:
            turn_label_widget.destroy()
            turn_label_widget = None
        if river_label_widget:
            river_label_widget.destroy()
            river_label_widget = None

        with shared_state["lock"]:
            for c in shared_state["locked_cards"]:
                lb = ttk.Label(hole_frame, text=c, font=("", 10, "bold"))
                lb.pack(side=tk.LEFT, padx=5)
                hole_labels.append(lb)
            for c in shared_state["flop_cards"]:
                lb = ttk.Label(flop_frame, text=c, font=("", 10, "bold"))
                lb.pack(side=tk.LEFT, padx=5)
                flop_labels.append(lb)
            if shared_state["turn_card"]:
                turn_label_widget = ttk.Label(
                    turn_frame, text=shared_state["turn_card"], font=("", 10, "bold")
                )
                turn_label_widget.pack(side=tk.LEFT, padx=5)
            if shared_state["river_card"]:
                river_label_widget = ttk.Label(
                    river_frame, text=shared_state["river_card"], font=("", 10, "bold")
                )
                river_label_widget.pack(side=tk.LEFT, padx=5)

    def update_detected_cards():
        """Update the detected cards display. Only show cards not already locked."""
        with shared_state["lock"]:
            detected = shared_state["detected_cards"]
            hole = set(shared_state["locked_cards"])
            flop = set(shared_state["flop_cards"])
            turn = {shared_state["turn_card"]} if shared_state["turn_card"] else set()
            river = {shared_state["river_card"]} if shared_state["river_card"] else set()
        known = hole | flop | turn | river
        # Only show detected cards that are not yet locked
        to_show = [c for c in detected if c not in known]

        for card in list(card_buttons.keys()):
            if card not in to_show:
                card_buttons[card].destroy()
                del card_buttons[card]

        for card in to_show:
            if card not in card_buttons:
                btn = ttk.Button(
                    detected_frame,
                    text=card,
                    command=lambda c=card: toggle_lock(c),
                    width=12,
                )
                btn.pack(side=tk.LEFT, padx=2, pady=2)
                card_buttons[card] = btn

        redraw_locked_sections()

    def toggle_lock(card: str):
        """Lock or unlock a card in the current mode."""
        mode = lock_mode.get()
        with shared_state["lock"]:
            hole = shared_state["locked_cards"]
            flop = shared_state["flop_cards"]
            turn = shared_state["turn_card"]
            river = shared_state["river_card"]

            if mode == "hole":
                if card in hole:
                    hole.remove(card)
                elif len(hole) < 2:
                    # Remove from any other category first
                    if card in flop:
                        flop.remove(card)
                    if turn == card:
                        shared_state["turn_card"] = None
                    if river == card:
                        shared_state["river_card"] = None
                    hole.append(card)
            elif mode == "flop":
                if card in flop:
                    flop.remove(card)
                elif len(flop) < 3:
                    if card in hole:
                        hole.remove(card)
                    if turn == card:
                        shared_state["turn_card"] = None
                    if river == card:
                        shared_state["river_card"] = None
                    flop.append(card)
            elif mode == "turn":
                if turn == card:
                    shared_state["turn_card"] = None
                else:
                    if card in hole:
                        hole.remove(card)
                    if card in flop:
                        flop.remove(card)
                    if river == card:
                        shared_state["river_card"] = None
                    shared_state["turn_card"] = card
            elif mode == "river":
                if river == card:
                    shared_state["river_card"] = None
                else:
                    if card in hole:
                        hole.remove(card)
                    if card in flop:
                        flop.remove(card)
                    if turn == card:
                        shared_state["turn_card"] = None
                    shared_state["river_card"] = card

        # Auto-advance to next slot when current one is full
        with shared_state["lock"]:
            n_hole = len(shared_state["locked_cards"])
            n_flop = len(shared_state["flop_cards"])
            has_turn = shared_state["turn_card"] is not None
            has_river = shared_state["river_card"] is not None
        if n_hole >= 2 and lock_mode.get() == "hole":
            lock_mode.set("flop")
        elif n_flop >= 3 and lock_mode.get() == "flop":
            lock_mode.set("turn")
        elif has_turn and lock_mode.get() == "turn":
            lock_mode.set("river")
        elif has_river and lock_mode.get() == "river":
            lock_mode.set("hole")  # Next hand

        update_detected_cards()

    def clear_all():
        """Clear all locked cards."""
        with shared_state["lock"]:
            shared_state["locked_cards"].clear()
            shared_state["flop_cards"].clear()
            shared_state["turn_card"] = None
            shared_state["river_card"] = None
        update_detected_cards()

    def refresh_display():
        if not stop_event.is_set():
            update_detected_cards()
            root.after(500, refresh_display)

    ttk.Button(button_frame, text="Clear all locked", command=clear_all).pack(side=tk.LEFT, padx=5)
    ttk.Label(
        button_frame, text="Close this window or video window to quit", font=("", 8)
    ).pack(side=tk.LEFT, padx=10)

    def on_closing():
        stop_event.set()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_closing)
    
    # Start periodic updates
    refresh_display()
    root.mainloop()


def main():
    # Shared state for communication between threads
    shared_state = {
        "detected_cards": [],
        "locked_cards": [],   # hole cards (max 2)
        "flop_cards": [],     # max 3
        "turn_card": None,    # str or None
        "river_card": None,   # str or None
        "lock": threading.Lock(),
    }
    stop_event = threading.Event()

    # Start webcam thread
    webcam_thread = threading.Thread(
        target=run_webcam, 
        args=(shared_state, stop_event), 
        daemon=True
    )
    webcam_thread.start()

    # Start card management window (blocks until closed)
    create_card_management_window(shared_state, stop_event)
    
    # Cleanup
    stop_event.set()


if __name__ == "__main__":
    main()
