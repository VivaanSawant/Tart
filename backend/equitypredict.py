"""
Equity prediction for poker hands. Reads card data from card_log.json or accepts
(hole, flop, turn, river) directly. Uses Monte Carlo simulation via treys.
"""

import json
import os
import random
from pathlib import Path

# Default path for card_log.json (same directory as this module)
DEFAULT_LOG_PATH = Path(__file__).resolve().parent / "card_log.json"

# Cache equity by (hole, flop, turn, river) to avoid recomputing
_equity_cache: dict[tuple, tuple[float | None, float | None, float | None]] = {}


def card_to_treys(s: str):
    """Convert one card string (e.g. 'As', '10h', '6d', '6S') to treys int, or None."""
    try:
        from treys import Card
    except ImportError:
        return None
    s = (s or "").strip()
    if not s:
        return None
    s = s.replace(" ", "").replace("-", "")[:3]
    if len(s) < 2:
        return None
    RANKS = "23456789TJQKA"
    SUIT_MAP = {"S": "s", "H": "h", "D": "d", "C": "c", "s": "s", "h": "h", "d": "d", "c": "c"}
    if s.upper().startswith("10") and len(s) >= 3:
        rank, suit = "T", SUIT_MAP.get(s[2:3].upper(), s[2:3].lower())
    elif len(s) >= 2:
        rank, suit = s[0:1].upper(), SUIT_MAP.get(s[1:2].upper(), s[1:2].lower())
    else:
        return None
    if rank not in RANKS or suit not in "shdc":
        return None
    return Card.new(rank + suit)


def equity_for_board(hole: list[str], board: list[str], num_trials: int = 300) -> float | None:
    """Monte Carlo equity (win %) vs random hand. Uses treys. Returns None if cards invalid."""
    try:
        from treys import Card, Evaluator
    except ImportError:
        return None
    RANKS, SUITS = "23456789TJQKA", "shdc"

    hole_ints = [card_to_treys(c) for c in hole]
    board_ints = [card_to_treys(c) for c in board]
    if None in hole_ints or None in board_ints or len(hole_ints) != 2 or len(board_ints) not in (3, 4, 5):
        return None
    used = hole_ints + board_ints
    if len(set(used)) != len(used):
        return None
    try:
        full_deck = [Card.new(r + s) for r in RANKS for s in SUITS]
        deck = [c for c in full_deck if c not in set(used)]
        evaluator = Evaluator()
        wins, ties = 0, 0
        need = 5 - len(board_ints)
        for _ in range(num_trials):
            random.shuffle(deck)
            opp = deck[:2]
            if need > 0:
                runout = deck[2 : 2 + need]
                full_board = board_ints + runout
            else:
                full_board = board_ints
            our = evaluator.evaluate(full_board, hole_ints)
            their = evaluator.evaluate(full_board, opp)
            if our < their:
                wins += 1
            elif our == their:
                ties += 1
        return round(100.0 * (wins + 0.5 * ties) / num_trials, 1)
    except Exception:
        return None


def compute_equities(
    hole: list[str],
    flop: list[str],
    turn: str | None,
    river: str | None,
) -> tuple[float | None, float | None, float | None]:
    """
    Return (equity_flop, equity_turn, equity_river).
    Only computed when we have 2 hole cards + 3 flop cards.
    """
    if len(hole) != 2 or len(flop) != 3:
        return None, None, None
    key = (tuple(sorted(hole)), tuple(sorted(flop)), turn, river)
    if key in _equity_cache:
        return _equity_cache[key]
    eq_flop = equity_for_board(hole, flop, 300)
    eq_turn = equity_for_board(hole, flop + [turn], 300) if turn else None
    eq_river = (
        equity_for_board(hole, flop + ([turn] if turn else []) + [river], 300)
        if river
        else None
    )
    if eq_flop is not None or eq_turn is not None or eq_river is not None:
        _equity_cache[key] = (eq_flop, eq_turn, eq_river)
    return eq_flop, eq_turn, eq_river


def load_from_log(log_path: str | os.PathLike | None = None) -> dict | None:
    """
    Load card state from card_log.json. Returns dict with keys:
    hole_cards, flop, turn, river (or None if file missing/invalid).
    """
    path = Path(log_path) if log_path else DEFAULT_LOG_PATH
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data
    except (OSError, json.JSONDecodeError):
        return None


def compute_equities_from_log(
    log_path: str | os.PathLike | None = None,
) -> tuple[float | None, float | None, float | None]:
    """
    Read card_log.json and compute (equity_flop, equity_turn, equity_river).
    Uses keys: hole_cards, flop, turn, river from the JSON.
    Returns (None, None, None) if file missing or hand incomplete.
    """
    data = load_from_log(log_path)
    if not data:
        return None, None, None
    hole = data.get("hole_cards") or []
    flop = data.get("flop") or []
    turn = data.get("turn")
    river = data.get("river")
    return compute_equities(hole, flop, turn, river)


def clear_cache() -> None:
    """Clear the equity cache (e.g. when starting a new hand)."""
    _equity_cache.clear()


if __name__ == "__main__":
    eq_flop, eq_turn, eq_river = compute_equities_from_log()
    print(f"Equity (flop): {eq_flop}%")
    print(f"Equity (turn): {eq_turn}%")
    print(f"Equity (river): {eq_river}%")
