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

# Cache: postflop by (hole, flop, turn, river, num_players); preflop by (hole, num_players)
_equity_cache: dict[tuple, tuple[float | None, float | None, float | None]] = {}
_preflop_cache: dict[tuple, float] = {}


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


def equity_preflop(hole: list[str], num_players: int = 2, num_trials: int = 500) -> float | None:
    """
    Preflop equity: % chance to win vs N-1 random hands when board is unknown.
    num_players: total players (hero + opponents). Heads-up = 2.
    """
    try:
        from treys import Card, Evaluator
    except ImportError:
        return None
    if num_players < 2 or num_players > 10:
        return None
    RANKS, SUITS = "23456789TJQKA", "shdc"

    hole_ints = [card_to_treys(c) for c in hole]
    if None in hole_ints or len(hole_ints) != 2:
        return None
    if hole_ints[0] == hole_ints[1]:
        return None
    key = (tuple(sorted(hole)), num_players)
    if key in _preflop_cache:
        return _preflop_cache[key]
    try:
        full_deck = [Card.new(r + s) for r in RANKS for s in SUITS]
        used = set(hole_ints)
        deck = [c for c in full_deck if c not in used]
        evaluator = Evaluator()
        n_opp = num_players - 1
        need_cards = 5 + n_opp * 2
        if need_cards > len(deck):
            return None
        eq_sum = 0.0
        for _ in range(num_trials):
            random.shuffle(deck)
            board = deck[:5]
            hands = [hole_ints]
            idx = 5
            for _ in range(n_opp):
                hands.append(deck[idx : idx + 2])
                idx += 2
            scores = [evaluator.evaluate(board, h) for h in hands]
            best = min(scores)
            winners = [i for i, s in enumerate(scores) if s == best]
            if 0 in winners:
                eq_sum += 1.0 / len(winners)
        result = round(100.0 * eq_sum / num_trials, 1)
        _preflop_cache[key] = result
        return result
    except Exception:
        return None


def equity_for_board(
    hole: list[str], board: list[str], num_players: int = 2, num_trials: int = 300
) -> float | None:
    """
    Monte Carlo equity (win %) vs N-1 random hands. Uses treys.
    Returns None if cards invalid.
    """
    try:
        from treys import Card, Evaluator
    except ImportError:
        return None
    if num_players < 2 or num_players > 10:
        return None
    RANKS, SUITS = "23456789TJQKA", "shdc"

    hole_ints = [card_to_treys(c) for c in hole]
    board_ints = [card_to_treys(c) for c in board]
    if None in hole_ints or None in board_ints or len(hole_ints) != 2 or len(board_ints) not in (3, 4, 5):
        return None
    used = hole_ints + board_ints
    if len(set(used)) != len(used):
        return None
    n_opp = num_players - 1
    try:
        full_deck = [Card.new(r + s) for r in RANKS for s in SUITS]
        deck = [c for c in full_deck if c not in set(used)]
        evaluator = Evaluator()
        need = 5 - len(board_ints)
        opp_cards = n_opp * 2
        if need + opp_cards > len(deck):
            return None
        eq_sum = 0.0
        for _ in range(num_trials):
            random.shuffle(deck)
            if need > 0:
                runout = deck[:need]
                full_board = board_ints + runout
                opp_deck = deck[need:]
            else:
                full_board = board_ints
                opp_deck = deck
            hands = [hole_ints]
            for i in range(n_opp):
                hands.append(opp_deck[i * 2 : i * 2 + 2])
            scores = [evaluator.evaluate(full_board, h) for h in hands]
            best = min(scores)
            winners = [i for i, s in enumerate(scores) if s == best]
            if 0 in winners:
                eq_sum += 1.0 / len(winners)
        return round(100.0 * eq_sum / num_trials, 1)
    except Exception:
        return None


def compute_equities(
    hole: list[str],
    flop: list[str],
    turn: str | None,
    river: str | None,
    num_players: int = 2,
) -> tuple[float | None, float | None, float | None]:
    """
    Return (equity_flop, equity_turn, equity_river).
    Only computed when we have 2 hole cards + 3 flop cards.
    """
    if len(hole) != 2 or len(flop) != 3:
        return None, None, None
    key = (tuple(sorted(hole)), tuple(sorted(flop)), turn, river, num_players)
    if key in _equity_cache:
        return _equity_cache[key]
    eq_flop = equity_for_board(hole, flop, num_players, 300)
    eq_turn = equity_for_board(hole, flop + [turn], num_players, 300) if turn else None
    eq_river = (
        equity_for_board(hole, flop + ([turn] if turn else []) + [river], num_players, 300)
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
    num_players: int = 2,
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
    return compute_equities(hole, flop, turn, river, num_players)


def _bet_recommendation_for_equity(equity: float | None) -> str:
    """
    Return a bet sizing recommendation based on win probability (0–100).
    Equity = percent chance to win vs random hand.
    """
    if equity is None:
        return "—"
    if equity >= 70:
        return "Value bet: 2/3–1× pot"
    if equity >= 55:
        return "Bet: 1/2–2/3 pot"
    if equity >= 45:
        return "Check or small bet: 1/3 pot"
    if equity >= 30:
        return "Check/call or fold if raised"
    return "Check/fold"


def get_bet_recommendations(
    equity_preflop: float | None,
    equity_flop: float | None,
    equity_turn: float | None,
    equity_river: float | None,
    has_preflop: bool = True,
    has_flop: bool = True,
    has_turn: bool = False,
    has_river: bool = False,
) -> dict[str, str]:
    """
    Return bet recommendation per street based on equity at that street.
    Keys: preflop, flop, turn, river.
    """
    return {
        "preflop": _bet_recommendation_for_equity(equity_preflop) if has_preflop else "—",
        "flop": _bet_recommendation_for_equity(equity_flop) if has_flop else "—",
        "turn": _bet_recommendation_for_equity(equity_turn) if has_turn else "—",
        "river": _bet_recommendation_for_equity(equity_river) if has_river else "—",
    }


def compute_full_analysis(
    log_path: str | os.PathLike | None = None,
    num_players: int = 2,
) -> dict:
    """
    Read card_log.json and return full analysis: equities + bet recommendations.
    Keys: equity_preflop, equity_flop, equity_turn, equity_river, bet_recommendations.
    """
    data = load_from_log(log_path)
    hole = (data or {}).get("hole_cards") or []
    eq_preflop = equity_preflop(hole, num_players) if len(hole) == 2 else None
    eq_flop, eq_turn, eq_river = compute_equities_from_log(log_path, num_players)
    has_preflop = eq_preflop is not None
    has_flop = eq_flop is not None
    has_turn = eq_turn is not None
    has_river = eq_river is not None
    bet_recs = get_bet_recommendations(
        eq_preflop, eq_flop, eq_turn, eq_river,
        has_preflop, has_flop, has_turn, has_river,
    )
    return {
        "equity_preflop": eq_preflop,
        "equity_flop": eq_flop,
        "equity_turn": eq_turn,
        "equity_river": eq_river,
        "bet_recommendations": bet_recs,
    }


def clear_cache() -> None:
    """Clear the equity cache (e.g. when starting a new hand)."""
    _equity_cache.clear()
    _preflop_cache.clear()


if __name__ == "__main__":
    analysis = compute_full_analysis()
    print(f"Equity (preflop): {analysis['equity_preflop']}%")
    print(f"Equity (flop): {analysis['equity_flop']}%")
    print(f"Equity (turn): {analysis['equity_turn']}%")
    print(f"Equity (river): {analysis['equity_river']}%")
