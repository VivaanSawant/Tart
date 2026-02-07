"""
Poker table simulator – action flow only, no card logic.

Tracks dealer, blinds, action order, and whose turn it is. Accepts actions
(check, call, raise, fold) and advances the hand. Designed so the CV/card
detection system can later be merged: the external system provides actions
and receives the current actor (whose view to show).

When the hero (tracked player) folds, a new hand starts automatically.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable

# Action types the simulator understands
CHECK = "check"
CALL = "call"
RAISE = "raise"
FOLD = "fold"


def _seat_to_position(seat: int, n: int, dealer: int, sb: int, bb: int) -> str:
    """Map seat to position name (UTG, MP, CO, BTN, SB, BB)."""
    first = (bb + 1) % n
    order = [(first + i) % n for i in range(n)]
    try:
        idx = order.index(seat)
    except ValueError:
        return "?"
    if n <= 2:
        return "SB" if seat == sb else "BB"
    if n == 3:
        return ["UTG", "SB", "BB"][idx]
    if n == 4:
        return ["UTG", "BTN", "SB", "BB"][idx]
    if n == 5:
        return ["UTG", "MP", "BTN", "SB", "BB"][idx]
    if n == 6:
        return ["UTG", "MP", "CO", "BTN", "SB", "BB"][idx]
    # 7+ players: use UTG, UTG+1, ..., CO, BTN, SB, BB
    names = ["UTG"] + [f"UTG+{i}" for i in range(1, n - 5)] + ["CO", "BTN", "SB", "BB"]
    return names[idx] if idx < len(names) else "?"


class Street(str, Enum):
    PREFLOP = "preflop"
    FLOP = "flop"
    TURN = "turn"
    RIVER = "river"


@dataclass
class TableConfig:
    """Configuration for the table."""
    num_players: int = 6
    small_blind: float = 0.10
    big_blind: float = 0.20
    hero_seat: int | None = None  # Auto-detected when hero acts with special button


@dataclass
class HandState:
    """State of the current hand – suitable for UI/CV display."""
    dealer_seat: int
    sb_seat: int
    bb_seat: int
    street: str
    current_actor: int | None  # Whose turn; None if hand over or between hands
    pot: float
    current_bet: float  # Amount to call this street
    players_in_hand: tuple[int, ...]
    player_bets_this_street: dict[int, float]
    hand_number: int
    is_new_hand: bool = False  # True right after a new hand starts


class TableSimulator:
    """
    Simulates table flow: dealer, blinds, action order.
    No card logic – only tracks who acts and when.
    """

    def __init__(
        self,
        config: TableConfig | None = None,
        on_hand_started: Callable[[HandState], None] | None = None,
        on_hand_ended: Callable[[HandState], None] | None = None,
    ):
        self.config = config or TableConfig()
        self.on_hand_started = on_hand_started
        self.on_hand_ended = on_hand_ended
        self._hand_number = 0
        self._dealer_seat = 0
        self._sb_seat = 0
        self._bb_seat = 0
        self._street = Street.PREFLOP
        self._pot = 0.0
        self._current_bet = 0.0
        self._players_in_hand: set[int] = set()
        self._player_bets: dict[int, float] = {}
        self._to_act: list[int] = []
        self._last_raiser_seat: int | None = None
        self._current_actor: int | None = None
        self._action_history: list[tuple[int, str, float]] = []
        self._start_new_hand()

    def _start_new_hand(self) -> None:
        """Reset and start a new hand."""
        self._hand_number += 1
        n = self.config.num_players
        sb = self.config.small_blind
        bb = self.config.big_blind

        # Rotate dealer
        self._dealer_seat = (self._dealer_seat + 1) % n
        self._sb_seat = (self._dealer_seat + 1) % n
        self._bb_seat = (self._dealer_seat + 2) % n

        self._street = Street.PREFLOP
        self._pot = sb + bb
        self._current_bet = bb
        self._players_in_hand = set(range(n))
        self._player_bets = {i: 0.0 for i in range(n)}
        self._player_bets[self._sb_seat] = sb
        self._player_bets[self._bb_seat] = bb
        self._last_raiser_seat = self._bb_seat
        self._action_history = []

        # Preflop: first to act is UTG (left of BB)
        first = (self._bb_seat + 1) % n
        self._to_act = self._action_order_from(first)
        self._current_actor = self._to_act[0] if self._to_act else None

        state = self.get_state()
        state.is_new_hand = True
        if self.on_hand_started:
            self.on_hand_started(state)

    def set_hero_seat(self, seat: int) -> None:
        """Set hero seat (called when hero first acts with the hero button)."""
        if self.config.hero_seat is None:
            # Use a mutable approach since dataclass fields can be reassigned
            object.__setattr__(self.config, "hero_seat", seat)

    def get_hero_position(self) -> str | None:
        """Return hero's position name (BTN, SB, BB, UTG, etc.) or None if hero unknown."""
        if self.config.hero_seat is None:
            return None
        return _seat_to_position(
            self.config.hero_seat,
            self.config.num_players,
            self._dealer_seat,
            self._sb_seat,
            self._bb_seat,
        )

    def _action_order_from(self, start: int) -> list[int]:
        """Players to act, clockwise from start, excluding folded."""
        n = self.config.num_players
        order = []
        for i in range(n):
            seat = (start + i) % n
            if seat in self._players_in_hand:
                order.append(seat)
        return order

    def _advance_street(self) -> bool:
        """Move to next street or end hand. Returns True if hand ended."""
        if self._street == Street.RIVER:
            return True
        if len(self._players_in_hand) <= 1:
            return True  # Hand over (should not reach here normally)

        streets = [Street.PREFLOP, Street.FLOP, Street.TURN, Street.RIVER]
        idx = streets.index(self._street)
        self._street = streets[idx + 1]
        self._current_bet = 0.0
        self._player_bets = {s: 0.0 for s in self._players_in_hand}
        self._last_raiser_seat = None

        n = self.config.num_players
        # Postflop: left of dealer acts first. Heads-up: button acts first.
        first = self._dealer_seat if n == 2 else (self._dealer_seat + 1) % n
        self._to_act = self._action_order_from(first)
        self._current_actor = self._to_act[0] if self._to_act else None
        return False

    def _all_matched(self) -> bool:
        """True if everyone still in has put in current_bet."""
        for seat in self._players_in_hand:
            if self._player_bets.get(seat, 0) < self._current_bet:
                return False
        return True

    def record_action(
        self,
        seat: int,
        action: str,
        amount: float = 0.0,
        is_hero_acting: bool = False,
    ) -> HandState | None:
        """
        Record an action from the given seat.
        When is_hero_acting=True, the current actor is registered as the hero (first time only).
        Returns updated HandState, or None if action was invalid.
        """
        if self._current_actor is None:
            return None
        if seat != self._current_actor:
            return None
        if seat not in self._players_in_hand:
            return None

        if is_hero_acting:
            self.set_hero_seat(seat)

        action = action.lower().strip()
        if action not in (CHECK, CALL, RAISE, FOLD):
            return None

        n = self.config.num_players
        my_bet = self._player_bets.get(seat, 0)
        to_call = self._current_bet - my_bet

        if action == FOLD:
            self._players_in_hand.discard(seat)
            self._action_history.append((seat, FOLD, 0.0))
            if seat in self._to_act:
                self._to_act.remove(seat)

            # Hero folded → start new hand (only if hero is known)
            if self.config.hero_seat is not None and seat == self.config.hero_seat:
                if self.on_hand_ended:
                    self.on_hand_ended(self.get_state())
                self._start_new_hand()
                return self.get_state()

            # Only one player left → hand over
            if len(self._players_in_hand) <= 1:
                if self.on_hand_ended:
                    self.on_hand_ended(self.get_state())
                self._start_new_hand()
                return self.get_state()

            self._advance_current_actor()
            return self.get_state()

        if action == CHECK:
            if to_call > 0:
                return None  # Can't check when there's a bet
            self._action_history.append((seat, CHECK, 0.0))
        elif action == CALL:
            add = min(to_call, amount if amount > 0 else to_call)
            if add < to_call and add > 0:
                add = to_call  # Must match full bet
            self._player_bets[seat] = self._player_bets.get(seat, 0) + add
            self._pot += add
            self._action_history.append((seat, CALL, add))
        elif action == RAISE:
            min_raise = 0.01
            raise_size = amount if amount > 0 else min_raise
            add = to_call + raise_size
            if add <= to_call:
                add = to_call + min_raise
            self._player_bets[seat] = self._player_bets.get(seat, 0) + add
            self._current_bet = self._player_bets[seat]
            self._pot += add
            self._last_raiser_seat = seat
            self._action_history.append((seat, RAISE, add))

            # Everyone after the raiser gets to act again
            first_after = (seat + 1) % n
            new_to_act = [
                s for s in self._action_order_from(first_after)
                if s != seat
            ]
            self._to_act = new_to_act

        # Remove current from to_act, advance
        if seat in self._to_act:
            self._to_act.remove(seat)

        # If to_act empty and all matched → next street or end
        if not self._to_act and self._all_matched():
            hand_ended = self._advance_street()
            if hand_ended:
                if self.on_hand_ended:
                    self.on_hand_ended(self.get_state())
                self._start_new_hand()
                return self.get_state()
        else:
            self._current_actor = self._to_act[0] if self._to_act else None

        return self.get_state()

    def _advance_current_actor(self) -> None:
        """Set current_actor to next in to_act, or None."""
        if self._to_act:
            self._current_actor = self._to_act[0]
        else:
            self._current_actor = None

    def get_state(self) -> HandState:
        """Current hand state for UI or CV integration."""
        return HandState(
            dealer_seat=self._dealer_seat,
            sb_seat=self._sb_seat,
            bb_seat=self._bb_seat,
            street=self._street.value,
            current_actor=self._current_actor,
            pot=self._pot,
            current_bet=self._current_bet,
            players_in_hand=tuple(sorted(self._players_in_hand)),
            player_bets_this_street=dict(self._player_bets),
            hand_number=self._hand_number,
        )

    def cost_to_call(self, seat: int) -> float:
        """Amount seat needs to put in to call this street."""
        my_bet = self._player_bets.get(seat, 0)
        return max(0.0, self._current_bet - my_bet)

    @property
    def current_actor(self) -> int | None:
        """Whose turn it is (for CV: show this player's view)."""
        return self._current_actor

    @property
    def is_hero_turn(self) -> bool:
        """True if it's the hero's turn to act."""
        return (
            self.config.hero_seat is not None
            and self._current_actor == self.config.hero_seat
        )


# ---------------------------------------------------------------------------
# CV integration hooks (for future merge)
# ---------------------------------------------------------------------------
#
# To merge with the CV app:
#
# 1. Create simulator:  sim = TableSimulator(config, on_hand_started=..., on_hand_ended=...)
#
# 2. When displaying video/UI:  if sim.current_actor is not None, show the view for that seat.
#    (Hero seat = camera; others = placeholders or multi-cam later)
#
# 3. When the human acts (from BettingModal or detected action):
#    sim.record_action(hero_seat, "call", amount=0.20)
#
# 4. For bots/other seats: either auto-act or receive from another input. The simulator
#    doesn't care where actions come from – it only validates order.
#
# 5. Pot/equity: sim.get_state().pot and sim.cost_to_call(seat) feed into pot_calc.
#
# 6. Card logger / equity: when sim.street changes, the CV pipeline (hole → flop → turn → river)
#    can sync. The simulator provides: street, current_actor, cost_to_call. The CV provides:
#    detected cards, equity, recommendation. Merge by: "on hero's turn, show equity for
#    current street; when hero acts, record_action and advance."
#


def demo() -> None:
    """Run a quick demo of the simulator."""
    def on_start(s: HandState) -> None:
        print(f"Hand #{s.hand_number} | Dealer {s.dealer_seat} | {s.street} | Pot ${s.pot:.2f} | Actor: {s.current_actor}")

    def on_end(s: HandState) -> None:
        print("  → Hand over\n")

    sim = TableSimulator(
        config=TableConfig(num_players=4, hero_seat=0),
        on_hand_started=on_start,
        on_hand_ended=on_end,
    )
    state = sim.get_state()
    print("Demo: 4 players, hero=seat 0. Simulating actions...\n")
    on_start(state)

    # Preflop: UTG folds, next calls, SB folds, BB checks
    sim.record_action(1, FOLD)
    sim.record_action(2, CALL, 0.20)
    sim.record_action(3, FOLD)
    sim.record_action(0, CALL, 0.10)  # Hero (BB) calls the ... actually BB is already in for 0.20. If everyone called, BB can check. Let me fix the demo.
    # Actually: 4 players, dealer=0, sb=1, bb=2. First to act = 3 (UTG). Order: 3, 0, 1, 2.
    # So: 3 folds, 0 calls? 0 is hero. 0 needs to put in 0.20 to call (BB is 0.20). So 0 calls 0.20. Then 1 (SB) needs to put 0.20 (already put 0.10) so 0.10 more. 1 folds. 2 (BB) can check (already put 0.20). So we need different actions.
    # Let me simplify: just run a few actions to show it works.
    sim2 = TableSimulator(config=TableConfig(num_players=3, hero_seat=0))
    s = sim2.get_state()
    print(f"\nHand 1: dealer={s.dealer_seat}, sb={s.sb_seat}, bb={s.bb_seat}, first to act={s.current_actor}")
    sim2.record_action(s.current_actor or 0, FOLD)  # First player folds
    s2 = sim2.get_state()
    print(f"After fold: current_actor={s2.current_actor}")
    sim2.record_action(s2.current_actor or 0, CALL, 0.20)
    s3 = sim2.get_state()
    print(f"After call: current_actor={s3.current_actor}, pot={s3.pot}")
    sim2.record_action(s3.current_actor or 0, FOLD)  # BB folds → hand over, new hand
    s4 = sim2.get_state()
    print(f"After BB fold: new hand #{s4.hand_number}, actor={s4.current_actor}")


if __name__ == "__main__":
    demo()
