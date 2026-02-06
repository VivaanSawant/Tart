"""
JSON logging for detected cards. Single line on terminal; updates only when the set of cards changes.
Can optionally log predicted equity (flop, turn, river) for the frontend.
If LOG_FILE path is set, the same JSON is written to that file each time we log.
"""

import json
import sys

# Set to a file path (e.g. "card_log.json") to write the latest state there every time we log
LOG_FILE: str | None = None

_last_hole: frozenset[str] | None = None
_last_flop: frozenset[str] | None = None
_last_turn: str | None = None
_last_river: str | None = None
_last_unknown: frozenset[str] | None = None
_last_equity_flop: float | None = None
_last_equity_turn: float | None = None
_last_equity_river: float | None = None
_first_run: bool = True


def log_cards_present(
    *,
    hole_cards: list[str] | None = None,
    flop_cards: list[str] | None = None,
    turn_card: str | None = None,
    river_card: str | None = None,
    unknown_cards: list[str] | None = None,
    equity_flop: float | None = None,
    equity_turn: float | None = None,
    equity_river: float | None = None,
) -> None:
    """
    Log hole cards, flop, turn, river, unknown cards, and optional equity (flop/turn/river).
    Updates only when any of these change.
    """
    global _last_hole, _last_flop, _last_turn, _last_river, _last_unknown
    global _last_equity_flop, _last_equity_turn, _last_equity_river, _first_run

    hole = frozenset(hole_cards or [])
    flop = frozenset(flop_cards or [])
    turn = turn_card
    river = river_card
    unknown = frozenset(unknown_cards or [])

    if (
        _last_hole == hole
        and _last_flop == flop
        and _last_turn == turn
        and _last_river == river
        and _last_unknown == unknown
        and _last_equity_flop == equity_flop
        and _last_equity_turn == equity_turn
        and _last_equity_river == equity_river
    ):
        return

    _last_hole = hole
    _last_flop = flop
    _last_turn = turn
    _last_river = river
    _last_unknown = unknown
    _last_equity_flop = equity_flop
    _last_equity_turn = equity_turn
    _last_equity_river = equity_river

    entry = {
        "hole_cards": sorted(hole),
        "flop": sorted(flop),
        "turn": turn,
        "river": river,
        "unknown_cards": sorted(unknown),
    }
    if equity_flop is not None:
        entry["equity_flop"] = equity_flop
    if equity_turn is not None:
        entry["equity_turn"] = equity_turn
    if equity_river is not None:
        entry["equity_river"] = equity_river

    line = json.dumps(entry)
    if _first_run:
        _first_run = False
        print("\033[2J\033[H", end="", flush=True, file=sys.stdout)
    else:
        print("\r\033[K", end="", flush=True, file=sys.stdout)
    print(line, end="", flush=True, file=sys.stdout)
    sys.stdout.flush()

    if LOG_FILE:
        try:
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                json.dump(entry, f, indent=2)
        except OSError:
            pass
