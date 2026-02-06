"""
Pot calculation and pot-odds recommendation for poker.

Tracks pot across four betting rounds: preflop, flop, turn, river.
You can set opponent bets (and optionally your calls) per street.
Given current equity, recommends call or fold based on pot odds.
"""

from __future__ import annotations

from dataclasses import dataclass, field

STREETS = ("preflop", "flop", "turn", "river")


@dataclass
class PotState:
    """Pot and bets per street. Amounts in same units (e.g. big blinds or dollars)."""
    starting_pot: float = 0.0  # e.g. blinds already in (1.5 BB)
    preflop: dict[str, float] = field(default_factory=lambda: {"opponent": 0.0, "hero": 0.0})
    flop: dict[str, float] = field(default_factory=lambda: {"opponent": 0.0, "hero": 0.0})
    turn: dict[str, float] = field(default_factory=lambda: {"opponent": 0.0, "hero": 0.0})
    river: dict[str, float] = field(default_factory=lambda: {"opponent": 0.0, "hero": 0.0})

    def _bets(self, street: str) -> dict[str, float]:
        if street not in STREETS:
            raise ValueError(f"Unknown street: {street}. Use one of {STREETS}")
        return getattr(self, street)

    def cumulative_pot_after_street(self, street: str) -> float:
        """Total pot at end of this street (after both players have put in their bets)."""
        total = self.starting_pot
        for s in STREETS:
            b = self._bets(s)
            total += b["opponent"] + b["hero"]
            if s == street:
                break
        return total

    def pot_before_our_call(self, street: str) -> float:
        """Pot as it stands when we're deciding to call (includes opponent's bet this street, not our call)."""
        total = self.starting_pot
        for s in STREETS:
            b = self._bets(s)
            if s == street:
                total += b["opponent"]
                break
            total += b["opponent"] + b["hero"]
        return total

    def amount_to_call(self, street: str) -> float:
        """How much we still need to put in this street to match opponent (0 if we've already called)."""
        b = self._bets(street)
        return max(0.0, b["opponent"] - b["hero"])

    def pot_after_our_call(self, street: str) -> float:
        """Pot size after we call (for pot-odds denominator)."""
        return self.pot_before_our_call(street) + self.amount_to_call(street)

    def required_equity_pct(self, street: str) -> float | None:
        """
        Break-even equity (as percentage) to call this street.
        required_equity = 100 * (amount_to_call / pot_after_call).
        Returns None if there's nothing to call.
        """
        to_call = self.amount_to_call(street)
        if to_call <= 0:
            return None
        pot_after = self.pot_after_our_call(street)
        if pot_after <= 0:
            return None
        return 100.0 * to_call / pot_after

    def to_dict(self) -> dict:
        """Serialize for JSON / API."""
        return {
            "starting_pot": self.starting_pot,
            "preflop": dict(self.preflop),
            "flop": dict(self.flop),
            "turn": dict(self.turn),
            "river": dict(self.river),
        }

    @classmethod
    def from_dict(cls, data: dict) -> PotState:
        """Load from dict (e.g. API payload)."""
        state = cls(starting_pot=float(data.get("starting_pot", 0) or 0))
        for street in STREETS:
            b = data.get(street) or {}
            if isinstance(b, dict):
                state._bets(street)["opponent"] = float(b.get("opponent", 0) or 0)
                state._bets(street)["hero"] = float(b.get("hero", 0) or 0)
        return state


def recommendation(
    equity_pct: float | None,
    street: str,
    pot_state: PotState,
) -> tuple[str, str]:
    """
    Given our hand equity (0–100), the street we're on, and pot state,
    return (verdict, reason).

    Verdict: "call" | "fold" | "no_bet"
    - "no_bet": opponent hasn't bet this street (nothing to call).
    - "call": equity >= required equity → calling is +EV or break-even.
    - "fold": equity < required equity → folding is better.
    """
    if street not in STREETS:
        return "no_bet", f"Unknown street: {street}"

    to_call = pot_state.amount_to_call(street)
    if to_call <= 0:
        return "no_bet", "No bet to call on this street."

    required = pot_state.required_equity_pct(street)
    if required is None:
        return "no_bet", "Could not compute required equity."

    if equity_pct is None:
        return "fold", f"Equity unknown. You need {required:.1f}% to call (pot odds)."

    if equity_pct >= required:
        return (
            "call",
            f"Equity {equity_pct:.1f}% ≥ required {required:.1f}% → call is profitable.",
        )
    return (
        "fold",
        f"Equity {equity_pct:.1f}% < required {required:.1f}% → fold.",
    )


def get_equity_for_street(
    street: str,
    equity_flop: float | None,
    equity_turn: float | None,
    equity_river: float | None,
) -> float | None:
    """
    Return the appropriate equity for the given street.
    Preflop has no board-based equity from our module; caller can pass None or use a separate estimate.
    """
    if street == "preflop":
        return None
    if street == "flop":
        return equity_flop
    if street == "turn":
        return equity_turn
    if street == "river":
        return equity_river
    return None
