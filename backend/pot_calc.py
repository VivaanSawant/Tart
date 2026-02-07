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
    """Pot and bets per street. Amounts in dollars (e.g. 0.10/0.20 blinds)."""
    starting_pot: float = 0.30  # Default: 10¢ SB + 20¢ BB
    preflop: dict[str, float] = field(default_factory=lambda: {"opponent": 0.2, "hero": 0.0})  # BB default
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


# Default thresholds (neutral play)
RAISE_WHEN_NO_BET_EQUITY = 55.0
RAISE_WHEN_FACING_BET_EQUITY = 60.0

# Aggression: lower thresholds = more calls/raises (aggressive), higher = fewer (conservative)
# call_buffer: added to break-even required equity. Aggressive: call with less. Conservative: call only with more.
# raise_no_bet / raise_facing_bet: equity % to recommend bet/raise.
AGGRESSION_THRESHOLDS = {
    "aggressive": {
        "call_buffer": -12.0,
        "raise_when_no_bet": 30.0,
        "raise_when_facing_bet": 34.0,
    },
    "neutral": {
        "call_buffer": 0.0,
        "raise_when_no_bet": 40.0,
        "raise_when_facing_bet": 44.0,
    },
    "conservative": {
        "call_buffer": 3.0,
        "raise_when_no_bet": 50.0,
        "raise_when_facing_bet": 54.0,
    },
}


def get_thresholds(aggression: str | None) -> dict:
    """Return threshold dict for aggression level. Default to neutral if unknown."""
    if aggression and aggression in AGGRESSION_THRESHOLDS:
        return AGGRESSION_THRESHOLDS[aggression].copy()
    return AGGRESSION_THRESHOLDS["neutral"].copy()


def recommendation(
    equity_pct: float | None,
    street: str,
    pot_state: PotState,
    aggression: str | None = "neutral",
) -> tuple[str, str]:
    """
    Given our hand equity (0–100), the street we're on, and pot state,
    return (verdict, reason). aggression: "aggressive" | "neutral" | "conservative"
    adjusts call/raise thresholds (aggressive = lower equity to call/raise).
    """
    if street not in STREETS:
        return "no_bet", f"Unknown street: {street}"

    th = get_thresholds(aggression)
    raise_no_bet = th["raise_when_no_bet"]
    raise_facing_bet = th["raise_when_facing_bet"]
    call_buffer = th["call_buffer"]

    to_call = pot_state.amount_to_call(street)
    required_raw = pot_state.required_equity_pct(street)
    required = (required_raw + call_buffer) if required_raw is not None else None

    # No bet to call — we can check or bet
    if to_call <= 0:
        if equity_pct is None:
            return "check", "Equity unknown. Check or bet small."
        if equity_pct >= raise_no_bet:
            return (
                "raise",
                f"Strong hand ({equity_pct:.1f}% equity). Bet ½–⅔ pot for value.",
            )
        if equity_pct >= 30:
            return (
                "check",
                f"Medium equity ({equity_pct:.1f}%). Check or small bet.",
            )
        return (
            "check",
            f"Weak hand ({equity_pct:.1f}%). Check.",
        )

    # Facing a bet — use pot odds (with call_buffer)
    if required is None:
        return "no_bet", "Could not compute required equity."

    if equity_pct is None:
        return (
            "fold",
            f"Equity unknown. You need ~{required:.1f}% to call (pot odds). Fold unless you know you're ahead.",
        )

    if equity_pct < required:
        return (
            "fold",
            f"Equity {equity_pct:.1f}% < required {required:.1f}% (pot odds) → fold.",
        )
    if equity_pct >= raise_facing_bet:
        return (
            "raise",
            f"Equity {equity_pct:.1f}% well above required {required:.1f}%. Raise for value.",
        )
    return (
        "call",
        f"Equity {equity_pct:.1f}% ≥ required {required:.1f}% (pot odds) → call is profitable.",
    )


def get_equity_for_street(
    street: str,
    equity_flop: float | None,
    equity_turn: float | None,
    equity_river: float | None,
    equity_preflop: float | None = None,
) -> float | None:
    """
    Return the appropriate equity for the given street.
    """
    if street == "preflop":
        return equity_preflop
    if street == "flop":
        return equity_flop
    if street == "turn":
        return equity_turn
    if street == "river":
        return equity_river
    return None
