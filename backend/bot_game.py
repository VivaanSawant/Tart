"""
Bot game mode: random cards, bots auto-act using pot_calc recommendations, showdown at end.
Completely separate from CV/camera flow. Hero seat is always 0.
"""

from __future__ import annotations

import random
import threading
import time

import equitypredict
import pot_calc
from table_simulator import (
    CHECK,
    CALL,
    FOLD,
    RAISE,
    TableConfig,
    TableSimulator,
)

RANKS = "23456789TJQKA"
SUITS = "shdc"
# Display format: "10" not "T" for frontend
RANK_DISPLAY = {"T": "10"}


def _card_to_display(treys_str: str) -> str:
    """Convert treys format (e.g. 'Th') to display format ('10h')."""
    if not treys_str or len(treys_str) < 2:
        return treys_str
    r, s = treys_str[0], treys_str[1:]
    return (RANK_DISPLAY.get(r, r) if r in RANK_DISPLAY else r) + s


def _display_to_treys(s: str) -> str:
    """Convert display format ('10h') to treys format ('Th')."""
    if not s or len(s) < 2:
        return s
    s = s.strip()
    if s.upper().startswith("10") and len(s) >= 3:
        return "T" + s[2:].lower()
    return s[0].upper() + s[1:].lower()


def build_deck() -> list[str]:
    """Return shuffled deck of card strings in display format (e.g. 'As', '10h')."""
    deck = []
    for r in RANKS:
        for s in SUITS:
            c = r + s
            deck.append(_card_to_display(c))
    random.shuffle(deck)
    return deck


def deal_hand(num_players: int) -> dict:
    """
    Deal a new hand. Returns dict with:
    - hole_cards: {seat: [c1, c2]}
    - flop: [c1, c2, c3]
    - turn: str
    - river: str
    """
    deck = build_deck()
    idx = 0

    hole_cards = {}
    for seat in range(num_players):
        hole_cards[seat] = [deck[idx], deck[idx + 1]]
        idx += 2

    flop = [deck[idx], deck[idx + 1], deck[idx + 2]]
    idx += 3
    turn = deck[idx]
    idx += 1
    river = deck[idx]

    return {"hole_cards": hole_cards, "flop": flop, "turn": turn, "river": river}


def evaluate_showdown(
    hole_cards: dict[int, list[str]],
    flop: list[str],
    turn: str,
    river: str,
    players_in_hand: list[int],
) -> tuple[int | None, dict[int, int]]:
    """
    Determine showdown winner. Returns (winner_seat, {seat: hand_rank}).
    Lower rank = better hand. Ties: multiple winners possible (split pot).
    """
    try:
        from treys import Card, Evaluator
    except ImportError:
        return None, {}

    def to_treys(c: str):
        return Card.new(_display_to_treys(c))

    board = [to_treys(c) for c in flop + [turn, river]]
    evaluator = Evaluator()

    scores = {}
    for seat in players_in_hand:
        hole = hole_cards.get(seat, [])
        if len(hole) != 2:
            continue
        hand = [to_treys(c) for c in hole]
        scores[seat] = evaluator.evaluate(board, hand)

    if not scores:
        return None, scores

    best = min(scores.values())
    winners = [s for s in players_in_hand if scores.get(s) == best]
    return winners[0] if len(winners) == 1 else winners[0], scores


def _pot_state_for_bot(table_state, cost_to_call: float):
    """Adapter for pot_calc.recommendation from table sim state."""

    class Adapter:
        def amount_to_call(self, street):
            return cost_to_call

        def required_equity_pct(self, street):
            pot = table_state.pot
            pot_after = pot + cost_to_call if cost_to_call > 0 else pot
            return (100.0 * cost_to_call / pot_after) if cost_to_call > 0 and pot_after > 0 else None

        def pot_before_our_call(self, street):
            return table_state.pot

    return Adapter()


def _bot_decide_impl(
    seat: int,
    hole: list[str],
    flop: list[str],
    turn: str | None,
    river: str | None,
    street: str,
    table_state,
    cost_to_call: float,
    num_players: int,
    aggression: str,
    remaining_stack: float = 10.0,
) -> tuple[str, float]:
    """Internal: get bot action given cost_to_call and remaining stack."""
    # Get equity for this seat
    if street == "preflop":
        eq = equitypredict.equity_preflop(hole, num_players)
        eq_flop = eq_turn = eq_river = None
    else:
        eq_flop, eq_turn, eq_river = equitypredict.compute_equities(hole, flop, turn, river, num_players)
        eq = pot_calc.get_equity_for_street(street, eq_flop, eq_turn, eq_river, equity_preflop=None)

    pot_adapter = _pot_state_for_bot(table_state, cost_to_call)
    verdict, _ = pot_calc.recommendation(
        eq, street, pot_adapter, aggression=aggression, stack_size=remaining_stack,
    )

    if verdict == "fold":
        return FOLD, 0
    if verdict == "check":
        return CHECK, 0
    if verdict == "call":
        return CALL, min(cost_to_call, remaining_stack)
    if verdict == "raise":
        pot = table_state.pot
        amount = max(0.2, 0.5 * pot)
        amount = min(amount, remaining_stack)  # cap to stack
        return RAISE, amount
    return CHECK, 0


class BotGame:
    """
    Manages a bot game: deals cards, runs table sim, bots auto-act, showdown.
    Hero is always seat 0.
    """

    BUY_IN = 10.00  # Default starting stack

    def __init__(self, num_players: int = 6, bot_delay_seconds: float = 1.5):
        self.num_players = max(2, min(10, num_players))
        self.hero_seat = 0
        self.bot_delay_seconds = max(0.0, min(5.0, bot_delay_seconds))  # clamp 0–5s
        self.cards: dict | None = None  # hole_cards, flop, turn, river
        self.showdown: dict | None = None  # winner_seat, hands, board, etc.
        self._frozen_state = None  # state at moment hand ended (for showdown display)
        self._table = TableSimulator(
            config=TableConfig(
                num_players=self.num_players,
                hero_seat=self.hero_seat,
                buy_in=self.BUY_IN,
                reset_stacks_each_hand=False,  # stacks persist across hands in bot game
            ),
            on_hand_ended=self._on_hand_ended,
        )
        self._aggression = "neutral"
        self._state_lock = threading.Lock()

    def _on_hand_ended(self, state):
        """When hand ends, compute showdown if hero was in. Store frozen state, award pot, deal next hand."""
        self._frozen_state = state
        pot_amount = state.pot
        players_in = list(state.players_in_hand)
        if self.hero_seat not in players_in:
            winner = players_in[0] if len(players_in) == 1 else None
            hands = {s: self.cards["hole_cards"][s] for s in players_in} if players_in else {}
            self.showdown = {"winner_seat": winner, "hands": hands, "board": {"flop": self.cards["flop"], "turn": self.cards["turn"], "river": self.cards["river"]}}
            if winner is not None:
                self._table.award_pot(winner, pot_amount)
            self._deal_next_hand()
            return
        if len(players_in) == 1:
            winner = players_in[0]
            self.showdown = {
                "winner_seat": winner,
                "hands": {winner: self.cards["hole_cards"][winner]},
                "board": {"flop": self.cards["flop"], "turn": self.cards["turn"], "river": self.cards["river"]},
            }
            self._table.award_pot(winner, pot_amount)
            self._deal_next_hand()
            return
        winner, ranks = evaluate_showdown(
            self.cards["hole_cards"],
            self.cards["flop"],
            self.cards["turn"],
            self.cards["river"],
            players_in,
        )
        hands = {s: self.cards["hole_cards"][s] for s in players_in}
        self.showdown = {
            "winner_seat": winner,
            "hands": hands,
            "ranks": ranks,
            "board": {"flop": self.cards["flop"], "turn": self.cards["turn"], "river": self.cards["river"]},
        }
        if winner is not None:
            self._table.award_pot(winner, pot_amount)
        self._deal_next_hand()

    def _deal_next_hand(self):
        """Deal cards for the next hand (table already advanced)."""
        self.cards = deal_hand(self.num_players)

    def start_hand(self) -> dict:
        """Deal cards for current hand. Table already has hand from __init__ or previous next_hand."""
        self.showdown = None
        self._frozen_state = None
        self.cards = deal_hand(self.num_players)
        return self.get_state()

    def get_state(self) -> dict:
        """Current state for API. If it's a bot's turn, run one bot action then wait so user can see."""
        with self._state_lock:
            return self._get_state_impl()

    def _get_state_impl(self) -> dict:
        """Internal: must be called with _state_lock held."""
        if self.showdown:
            return self._state_to_dict(self._frozen_state, showdown_cards=self.showdown)

        ts = self._table
        state = ts.get_state()

        # Run one bot action per call, then wait so user can see what happened
        last_bot_action = None
        if state.current_actor is not None and state.current_actor != self.hero_seat:
            seat = state.current_actor
            cost = ts.cost_to_call(seat)
            hole = self.cards["hole_cards"].get(seat, [])
            flop = self.cards["flop"]
            turn = self.cards.get("turn") if state.street in ("turn", "river") else None
            river = self.cards.get("river") if state.street == "river" else None

            bot_stack = ts.remaining_stack(seat)
            action, amount = _bot_decide_impl(
                seat, hole, flop, turn, river,
                state.street, state, cost, self.num_players, self._aggression,
                remaining_stack=bot_stack,
            )
            result = ts.record_action(seat, action, amount, is_hero_acting=False)
            if result is not None:
                last_bot_action = {"seat": seat, "action": action, "amount": amount}
                state = result
                if self.bot_delay_seconds > 0:
                    time.sleep(self.bot_delay_seconds)

            # If hand ended (e.g. everyone folded), _on_hand_ended set self.showdown
            if state.current_actor is None and not self.showdown:
                players_in = list(state.players_in_hand)
                if players_in:
                    self.showdown = {"winner_seat": players_in[0], "hands": {players_in[0]: self.cards["hole_cards"][players_in[0]]}}

        return self._state_to_dict(state, last_bot_action=last_bot_action)

    def hero_action(self, action: str, amount: float = 0) -> dict | None:
        """Hero acts. Returns new state or None if invalid."""
        with self._state_lock:
            ts = self._table
            state = ts.get_state()
            if state.current_actor != self.hero_seat:
                return None
            cost = ts.cost_to_call(self.hero_seat)
            hero_stack = ts.remaining_stack(self.hero_seat)
            if action == "check" and cost > 0:
                return None
            if action == "call":
                amount = min(max(amount, cost), hero_stack)
            elif action == "raise":
                amount = max(amount, 0.2)
                amount = min(amount, hero_stack)  # cap to remaining stack

            action_map = {"check": CHECK, "call": CALL, "fold": FOLD, "raise": RAISE}
            act = action_map.get(action.lower())
            if act is None:
                return None
            result = ts.record_action(self.hero_seat, act, amount, is_hero_acting=True)
            if result is None:
                return None
            return self._state_to_dict(result)

    def get_table_state(self):
        """Get raw table state (for _state_to_dict)."""
        return self._table.get_state()

    def next_hand(self) -> dict:
        """After showdown, continue to next hand (cards already dealt)."""
        self.showdown = None
        self._frozen_state = None
        return self.get_state()

    def set_aggression(self, aggression: str):
        self._aggression = aggression if aggression in ("conservative", "neutral", "aggressive") else "neutral"

    def _state_to_dict(self, state, showdown_cards: dict | None = None, last_bot_action: dict | None = None) -> dict:
        ts = self._table
        if showdown_cards:
            hole = showdown_cards.get("hands", {})
            board = showdown_cards.get("board") or {}
            flop = board.get("flop", [])
            turn = board.get("turn")
            river = board.get("river")
        else:
            # During hand: only show hero's hole cards; reveal board progressively
            full_hole = self.cards["hole_cards"] if self.cards else {}
            hole = {self.hero_seat: full_hole[self.hero_seat]} if self.hero_seat in full_hole else {}
            flop = self.cards["flop"] if self.cards and state.street in ("flop", "turn", "river") else []
            turn = self.cards["turn"] if self.cards and state.street in ("turn", "river") else None
            river = self.cards["river"] if self.cards and state.street == "river" else None

        return {
            "dealer_seat": state.dealer_seat,
            "sb_seat": state.sb_seat,
            "bb_seat": state.bb_seat,
            "street": state.street,
            "current_actor": state.current_actor,
            "pot": state.pot,
            "current_bet": state.current_bet,
            "players_in_hand": list(state.players_in_hand),
            "player_bets_this_street": {str(k): v for k, v in state.player_bets_this_street.items()},
            "hand_number": state.hand_number,
            "hero_seat": self.hero_seat,
            "num_players": self.num_players,
            "cost_to_call": ts.cost_to_call(state.current_actor) if state.current_actor is not None else 0,
            "player_stacks": {str(k): round(v, 2) for k, v in state.player_stacks.items()},
            "all_in_players": list(state.all_in_players),
            "hole_cards": hole,
            "flop": flop,
            "turn": turn,
            "river": river,
            "showdown": self.showdown,
            "last_bot_action": last_bot_action,
        }
