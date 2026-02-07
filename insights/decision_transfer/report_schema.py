"""
Schema for decision_transfer module.

Defines the read-only input contract (PlayerCognitiveProfile) and the output
structure (DecisionTransferReport). This module does not define or modify
how the profile is produced; it only consumes the profile as exposed by the
existing Player Profile integration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Input: PlayerCognitiveProfile (existing interface — read-only, immutable)
# ---------------------------------------------------------------------------

# Risk tolerance curve: typically (stake_level_low_to_high, tolerance_0_to_1)
# or a single shape parameter. Stored as a list of (x, y) or dict for flexibility.
RiskToleranceCurve = list[tuple[float, float]] | dict[str, float] | None

# Trait confidence: per-trait confidence in [0, 1] or similar
TraitConfidenceScores = dict[str, float]


@dataclass(frozen=True)
class PlayerCognitiveProfile:
    """
    Existing Player Cognitive Profile interface.
    Consumed read-only; do not modify. All fields optional to support
    partial profiles; interpretation logic handles missing values.
    """
    risk_tolerance_curve: RiskToleranceCurve = None
    loss_aversion_coefficient: float | None = None  # typically >= 0; higher = more loss-averse
    aggression_vs_passivity_index: float | None = None  # e.g. 0–100; higher = more aggressive
    tilt_susceptibility: float | None = None  # e.g. 0–1; higher = more tilt-prone
    time_pressure_sensitivity: float | None = None  # e.g. 0–1; higher = more affected by time
    decision_consistency: float | None = None  # e.g. 0–1; higher = more consistent
    trait_confidence_scores: TraitConfidenceScores | None = None

    def to_dict(self) -> dict[str, Any]:
        """Read-only serialization for downstream consumers."""
        return {
            "risk_tolerance_curve": self.risk_tolerance_curve,
            "loss_aversion_coefficient": self.loss_aversion_coefficient,
            "aggression_vs_passivity_index": self.aggression_vs_passivity_index,
            "tilt_susceptibility": self.tilt_susceptibility,
            "time_pressure_sensitivity": self.time_pressure_sensitivity,
            "decision_consistency": self.decision_consistency,
            "trait_confidence_scores": self.trait_confidence_scores,
        }


# ---------------------------------------------------------------------------
# Output: DecisionTransferReport
# ---------------------------------------------------------------------------

@dataclass
class TraitTendencySummary:
    """Section 1: Per-trait decision tendencies."""
    trait_name: str
    cognitive_interpretation: str
    typical_decision_manifestations: list[str]
    situations_advantageous: list[str]
    situations_harmful: list[str]
    confidence_note: str = ""


@dataclass
class HabitInsight:
    """Section 2: Reflective habit-level insight for one trait."""
    trait_name: str
    protective_habits: list[str]
    corrective_habits: list[str]
    early_warning_signals: list[str]


@dataclass
class DomainTransfer:
    """Section 3: Cross-domain implication for one domain."""
    domain: str
    likely_strength: str
    likely_failure_mode: str
    mental_adjustment: str


@dataclass
class StressResponseProfile:
    """Section 4: Cognitive load and stress response."""
    decision_quality_under_stress: str
    time_pressure_effects: str
    simplification_vs_exploration: str
    uncertainty_notes: list[str] = field(default_factory=list)


@dataclass
class SummaryCard:
    """Section 5: Human-readable one-page summary."""
    top_3_dominant_traits: list[tuple[str, str]]  # (trait, short description)
    top_3_decision_risk_patterns: list[tuple[str, str]]
    top_3_transferable_habits: list[tuple[str, str]]
    confidence_levels: str


@dataclass
class DecisionTransferReport:
    """Full report produced by the transfer engine."""
    decision_tendencies_summary: list[TraitTendencySummary]
    habit_insights: list[HabitInsight]
    cross_domain_transfer: list[DomainTransfer]
    cognitive_load_stress_profile: StressResponseProfile
    summary_card: SummaryCard
