"""
Bot players for poker table simulator.
Bots play with aggression inverse to the player's profile (0-100).
Bots are assigned random hole cards that don't overlap with hero's cards or the board.
"""

from __future__ import annotations

import random

CHECK = "check"

# Full deck: rank + suit, e.g. "As", "Kh", "Td", "2c"
RANKS = "23456789TJQKA"
SUITS = "shdc"
FULL_DECK = [r + s for r in RANKS for s in SUITS]


def _normalize_card(c: str) -> str:
    """Normalize card string to our format (e.g. '10h' -> 'Th')."""
    if not c:
        return ""
    c = (c or "").strip().replace("10", "T").replace("0", "").upper()
    if len(c) >= 2 and c[0] in "23456789TJQKA" and c[-1].lower() in "shdc":
        return c[0] + c[-1].lower()
    return c


def _aggression_level(bot_aggression: float) -> str:
    """Map bot_aggression 0-100 to pot_calc aggression: conservative | neutral | aggressive."""
    a = max(0, min(100, bot_aggression))
    if a >= 67:
        return "aggressive"
    if a >= 34:
        return "neutral"
    return "conservative"


def assign_bot_hole_cards(
    hero_seat: int,
    players_in_hand: tuple[int, ...],
    used_cards: set[str],
    hand_number: int,
) -> dict[int, list[str]]:
    """
    Assign each non-hero player 2 random hole cards from the deck excluding used_cards.
    used_cards = hero's hole + flop + turn + river.
    Returns { seat: [card1, card2], ... } for bot seats only.
    """
    used_normalized = {_normalize_card(c) for c in used_cards if _normalize_card(c)}
    deck = [c for c in FULL_DECK if c not in used_normalized]
    random.shuffle(deck)
    result: dict[int, list[str]] = {}
    idx = 0
    for seat in players_in_hand:
        if seat == hero_seat:
            continue
        if idx + 2 > len(deck):
            break
        result[seat] = [deck[idx], deck[idx + 1]]
        idx += 2
    return result


CALL = "call"
RAISE = "raise"
FOLD = "fold"


def decide_bot_action(
    seat: int,
    street: str,
    pot: float,
    to_call: float,
    current_bet: float,
    bot_aggression: float,
    *,
    equity_pct: float | None = None,
    pot_state_adapter=None,
) -> tuple[str, float]:
    """
    Decide action using same pot-odds logic as main game.
    bot_aggression 0-100 (inverse of player profile) maps to aggression thresholds.
    If equity_pct and pot_state_adapter are provided, use pot_calc.recommendation.
    Otherwise fall back to synthetic equity.
    Returns (action, amount) where amount is used for call/raise.
    """
    import pot_calc

    half_pot = max(0.2, 0.5 * pot)
    aggression = _aggression_level(bot_aggression)

    if equity_pct is not None and pot_state_adapter is not None:
        verdict, _ = pot_calc.recommendation(
            equity_pct, street, pot_state_adapter, aggression=aggression
        )
        if verdict == "fold":
            return FOLD, 0
        if verdict == "call":
            return CALL, to_call
        if verdict == "check":
            return CHECK, 0
        if verdict == "raise":
            return RAISE, half_pot
        return CHECK, 0

    # Fallback when no equity (e.g. hero hasn't scanned): synthetic equity
    can_check = to_call <= 0
    synth = 25 + (bot_aggression / 100) * 50 + random.uniform(-8, 8)
    synth = max(10, min(90, synth))
    required = (100.0 * to_call / (pot + to_call)) if to_call > 0 and (pot + to_call) > 0 else 0

    if can_check:
        if synth >= 55 and bot_aggression >= 55:
            return RAISE, half_pot
        return CHECK, 0
    if synth < required - 10:
        return FOLD, 0
    if synth >= required + 15 and bot_aggression >= 55:
        if random.random() < 0.3:
            return RAISE, half_pot
    return CALL, to_call
