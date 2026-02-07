"""
Decision transfer: interpretation and habit-formation layer that translates
a player's cognitive profile into general human decision-making insights.

This module consumes only the existing PlayerCognitiveProfile (read-only)
and produces a DecisionTransferReport. It does not read game state, hands,
EV, or bot outputs. It does not modify the Player Profile integration.
"""

from .report_schema import (
    PlayerCognitiveProfile,
    DecisionTransferReport,
    TraitTendencySummary,
    HabitInsight,
    DomainTransfer,
    StressResponseProfile,
    SummaryCard,
)
from .transfer_engine import generate_report

__all__ = [
    "PlayerCognitiveProfile",
    "DecisionTransferReport",
    "TraitTendencySummary",
    "HabitInsight",
    "DomainTransfer",
    "StressResponseProfile",
    "SummaryCard",
    "generate_report",
]
