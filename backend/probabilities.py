'''
Hand Ranks:
1 - Royal Flush
2 - Straight Flush
3 - 4 of a Kind
4 - Full House
5 - Flush
6 - Straight
7 - 3 of a Kind
8 - Two Pair
9 - Pair
10 - High Card

Suits:
1 - Hearts
2 - Diamonds
3 - Spades
4 - Clubs

Ranks:
1 - A
2 - 2
3 - 3
4 - 4
5 - 5
6 - 6
7 - 7
8 - 8
9 - 9
10 - 10
11 - J
12 - Q
13 - K
'''

from itertools import combinations


# ---------------------------------------------------------------------------
# Card / Hand / HoleCards
# ---------------------------------------------------------------------------

class Card:
    def __init__(self, suit: int, rank: int):
        self.suit = suit
        self.rank = rank

    def __repr__(self):
        suits = ["Hearts", "Diamonds", "Spades", "Clubs"]
        ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
        return f"{ranks[self.rank - 1]} of {suits[self.suit - 1]}"

    def __eq__(self, other):
        if not isinstance(other, Card):
            return False
        return self.suit == other.suit and self.rank == other.rank

    def __hash__(self):
        return hash((self.suit, self.rank))


class Hand:
    """Represents a board (0 to 5 community cards)."""
    def __init__(self, cards: list[Card]):
        self.cards = cards
        self.ranks = [card.rank for card in cards]
        self.suits = [card.suit for card in cards]

    def __repr__(self):
        return str(list(map(repr, self.cards)))

    def __len__(self):
        return len(self.cards)


class HoleCards:
    """Represents hole cards – the 2 private cards a player holds."""
    def __init__(self, cards: list[Card]):
        if len(cards) != 2:
            raise ValueError("There must be exactly 2 hole cards")
        self.cards = cards
        self.ranks = [card.rank for card in cards]
        self.suits = [card.suit for card in cards]

    def __repr__(self):
        return str(list(map(repr, self.cards)))


# ---------------------------------------------------------------------------
# Precomputed straight bitmasks  (bit i ↔ rank i, i = 1..13)
# ---------------------------------------------------------------------------

_STRAIGHT_MASKS = []
for _low in range(1, 10):            # A(1)-5  through  9-K
    _mask = 0
    for _i in range(5):
        _mask |= (1 << (_low + _i))
    _STRAIGHT_MASKS.append(_mask)

# Ace-high (royal) straight:  A  10  J  Q  K
_ROYAL_MASK = (1 << 1) | (1 << 10) | (1 << 11) | (1 << 12) | (1 << 13)
_STRAIGHT_MASKS.append(_ROYAL_MASK)


def _has_straight(bits: int) -> bool:
    """Return True if the rank-bitmask contains 5 consecutive ranks (or A-high)."""
    for mask in _STRAIGHT_MASKS:
        if (bits & mask) == mask:
            return True
    return False


# ---------------------------------------------------------------------------
# 5-card hand rank evaluator  (kept for standalone use)
# ---------------------------------------------------------------------------

def hand_rank(hand: Hand) -> int:
    """Return the rank (1–10) of a 5-card hand."""
    ranks = sorted(hand.ranks)
    suits = hand.suits

    is_flush = len(set(suits)) == 1

    # Check straight
    rank_set = set(ranks)
    is_royal_straight = rank_set == {1, 10, 11, 12, 13}
    if is_royal_straight:
        is_straight = True
    else:
        min_r = ranks[0]
        is_straight = (ranks == list(range(min_r, min_r + 5)))

    if is_flush and is_straight:
        return 1 if is_royal_straight else 2

    # Frequency analysis
    freq = sorted((ranks.count(r) for r in set(ranks)), reverse=True)

    if freq[0] == 4:
        return 3                          # Four of a Kind
    if freq[0] == 3 and freq[1] == 2:
        return 4                          # Full House
    if is_flush:
        return 5                          # Flush
    if is_straight:
        return 6                          # Straight
    if freq[0] == 3:
        return 7                          # Three of a Kind
    if freq[0] == 2 and freq[1] == 2:
        return 8                          # Two Pair
    if freq[0] == 2:
        return 9                          # Pair
    return 10                             # High Card


# ---------------------------------------------------------------------------
# Fast 7-card best-hand evaluator (no 21-subset enumeration)
# ---------------------------------------------------------------------------

def best_hand_rank_7(cards_tuples) -> int:
    """
    Given exactly 7 cards as (suit, rank) tuples, return the best possible
    5-card hand rank (1 = Royal Flush … 10 = High Card).

    Evaluates directly from the 7-card structure without generating all
    C(7,5) = 21 five-card subsets.
    """
    rank_count = [0] * 14          # indices 1–13
    suit_bits  = [0] * 5           # indices 1–4  (rank bitmask per suit)
    suit_cnt   = [0] * 5

    for suit, rank in cards_tuples:
        rank_count[rank] += 1
        suit_bits[suit] |= (1 << rank)
        suit_cnt[suit] += 1

    # ---- flush / straight-flush / royal-flush ----
    flush_bits = 0
    for s in range(1, 5):
        if suit_cnt[s] >= 5:
            flush_bits = suit_bits[s]
            break

    if flush_bits and _has_straight(flush_bits):
        if (flush_bits & _ROYAL_MASK) == _ROYAL_MASK:
            return 1                      # Royal Flush
        return 2                          # Straight Flush

    # ---- rank-frequency analysis ----
    freqs = sorted((rank_count[r] for r in range(1, 14) if rank_count[r]),
                   reverse=True)

    if freqs[0] >= 4:
        return 3                          # Four of a Kind
    if freqs[0] >= 3 and freqs[1] >= 2:
        return 4                          # Full House
    if flush_bits:
        return 5                          # Flush

    # ---- straight ----
    all_bits = 0
    for r in range(1, 14):
        if rank_count[r]:
            all_bits |= (1 << r)
    if _has_straight(all_bits):
        return 6                          # Straight

    if freqs[0] >= 3:
        return 7                          # Three of a Kind
    if freqs[0] >= 2 and freqs[1] >= 2:
        return 8                          # Two Pair
    if freqs[0] >= 2:
        return 9                          # Pair
    return 10                             # High Card


# ---------------------------------------------------------------------------
# Probability calculation  (exact enumeration of all board completions)
# ---------------------------------------------------------------------------

HAND_RANK_NAMES = {
    1:  "Royal Flush",
    2:  "Straight Flush",
    3:  "Four of a Kind",
    4:  "Full House",
    5:  "Flush",
    6:  "Straight",
    7:  "Three of a Kind",
    8:  "Two Pair",
    9:  "Pair",
    10: "High Card",
}


def calculate_hand_probabilities(board: Hand, hole: HoleCards) -> dict[int, float]:
    """
    Exact probability of the BEST 5-card hand being each rank (1–10).

    For every possible way to complete the board to 5 cards, the best
    hand rank from the 7 total cards (5 board + 2 hole) is determined.

    Each rank's probability is STRICT / EXCLUSIVE: it counts only the
    outcomes where that rank is the best achievable hand.  Better hands
    are never double-counted into worse categories.

    Parameters
    ----------
    board : Hand   – 0, 3, 4, or 5 community cards
    hole  : HoleCards – 2 private cards

    Returns
    -------
    dict mapping hand rank (1–10) to probability (float, 0.0–1.0).
    """
    board_len = len(board)
    if board_len > 5:
        raise ValueError("Board cannot have more than 5 cards")

    # Known cards as (suit, rank) tuples
    known = [(c.suit, c.rank) for c in board.cards + hole.cards]
    known_set = set(known)
    if len(known_set) != len(known):
        raise ValueError("Duplicate cards detected")

    # Remaining deck
    remaining = [(s, r) for s in range(1, 5) for r in range(1, 14)
                 if (s, r) not in known_set]

    cards_needed = 5 - board_len
    counts = [0] * 11                     # index 1–10
    total = 0

    if cards_needed == 0:
        rank = best_hand_rank_7(known)
        counts[rank] = 1
        total = 1
    else:
        for combo in combinations(remaining, cards_needed):
            all_cards = known + list(combo)
            rank = best_hand_rank_7(all_cards)
            counts[rank] += 1
            total += 1

    return {i: counts[i] / total for i in range(1, 11)}


def print_probabilities(board: Hand, hole: HoleCards):
    """Pretty-print strict hand-rank probabilities."""
    board_len = len(board)
    cards_needed = 5 - board_len

    stage_names = {0: "Pre-flop", 3: "Flop", 4: "Turn", 5: "River"}
    stage = stage_names.get(board_len, f"{board_len} board cards")

    print(f"\nStage : {stage}")
    print(f"Board : {board if board_len else '(none)'}")
    print(f"Hole  : {hole}")
    print(f"Cards to come: {cards_needed}")

    if cards_needed == 5:
        from math import comb
        print(f"Enumerating {comb(50, 5):,} possible boards …")

    print("-" * 48)

    probs = calculate_hand_probabilities(board, hole)

    for rank in range(1, 11):
        pct = probs[rank] * 100
        bar = "█" * int(pct)                # simple visual bar
        print(f"  {HAND_RANK_NAMES[rank]:<20s} {pct:>9.4f}%  {bar}")

    print("-" * 48)
    print(f"  {'Total':<20s} {sum(probs.values()) * 100:>9.4f}%")
    print()


# ---------------------------------------------------------------------------
# Example usage
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # --- River example: A♥ K♥ hole, 10♥ J♥ Q♥ 2♠ 8♦ board ---
    print("=== River (5 board cards) ===")
    print_probabilities(
        Hand([Card(1, 10), Card(1, 11), Card(1, 12), Card(3, 2), Card(2, 8)]),
        HoleCards([Card(1, 1), Card(1, 13)])
    )

    # --- Turn example ---
    print("=== Turn (4 board cards) ===")
    print_probabilities(
        Hand([Card(1, 10), Card(1, 11), Card(1, 12), Card(3, 2)]),
        HoleCards([Card(1, 1), Card(1, 13)])
    )

    # --- Flop example ---
    print("=== Flop (3 board cards) ===")
    print_probabilities(
        Hand([Card(1, 10), Card(1, 11), Card(1, 12)]),
        HoleCards([Card(1, 1), Card(1, 13)])
    )

    # --- Pre-flop example (takes ~30-60 sec) ---
    print("=== Pre-flop (0 board cards) ===")
    print_probabilities(
        Hand([]),
        HoleCards([Card(1, 1), Card(1, 13)])
    )
