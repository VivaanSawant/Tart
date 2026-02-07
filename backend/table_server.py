"""
Minimal Flask server for the table simulator. Runs standalone (no webcam).
Use when you want to test/visualize the table simulator without the full PokerPlaya stack.
"""

from flask import Flask, jsonify, request

try:
    from flask_cors import CORS
except ImportError:
    CORS = None

from table_simulator import (
    CHECK,
    CALL,
    FOLD,
    RAISE,
    TableConfig,
    TableSimulator,
)

app = Flask(__name__)
if CORS:
    CORS(app)

# Global simulator instance
sim: TableSimulator | None = None


def _get_sim() -> TableSimulator:
    global sim
    if sim is None:
        sim = TableSimulator(config=TableConfig(num_players=6, hero_seat=None))
    return sim


def _state_to_dict(s) -> dict:
    sim = _get_sim()
    return {
        "dealer_seat": s.dealer_seat,
        "sb_seat": s.sb_seat,
        "bb_seat": s.bb_seat,
        "street": s.street,
        "current_actor": s.current_actor,
        "pot": s.pot,
        "current_bet": s.current_bet,
        "players_in_hand": list(s.players_in_hand),
        "player_bets_this_street": {str(k): v for k, v in s.player_bets_this_street.items()},
        "hand_number": s.hand_number,
        "hero_seat": sim.config.hero_seat,
        "hero_position": sim.get_hero_position(),
        "num_players": sim.config.num_players,
        "cost_to_call": sim.cost_to_call(s.current_actor) if s.current_actor is not None else 0,
    }


@app.route("/api/table/state")
def table_state():
    s = _get_sim().get_state()
    return jsonify(_state_to_dict(s))


@app.route("/api/table/action", methods=["POST"])
def table_action():
    data = request.get_json(force=True, silent=True) or {}
    seat = data.get("seat")
    action = data.get("action", "").lower().strip()
    amount = float(data.get("amount") or 0)
    is_hero_acting = bool(data.get("is_hero_acting", False))
    if seat is None or seat < 0:
        return jsonify({"ok": False, "error": "missing or invalid 'seat'"}), 400
    if action not in (CHECK, CALL, RAISE, FOLD):
        return jsonify({"ok": False, "error": "action must be check, call, raise, or fold"}), 400
    result = _get_sim().record_action(int(seat), action, amount, is_hero_acting=is_hero_acting)
    if result is None:
        return jsonify({"ok": False, "error": "invalid action (wrong turn?)"}), 400
    return jsonify({"ok": True, "state": _state_to_dict(result)})


@app.route("/api/table/reset", methods=["POST"])
def table_reset():
    global sim
    data = request.get_json(force=True, silent=True) or {}
    num_players = int(data.get("num_players") or 6)
    num_players = max(2, min(10, num_players))
    sim = TableSimulator(config=TableConfig(num_players=num_players, hero_seat=None))
    return jsonify({"ok": True, "state": _state_to_dict(sim.get_state())})


@app.route("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("Table simulator server at http://127.0.0.1:5002")
    app.run(host="0.0.0.0", port=5002)
