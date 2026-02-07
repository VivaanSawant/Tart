"""
Decision transfer engine: builds a DecisionTransferReport from a PlayerCognitiveProfile.
Deterministic, rule-based only. No ML; no game state, hands, or bot outputs.
"""

from __future__ import annotations

from .report_schema import (
    PlayerCognitiveProfile,
    DecisionTransferReport,
    TraitTendencySummary,
    HabitInsight,
    DomainTransfer,
    StressResponseProfile,
    SummaryCard,
)
from .trait_mappings import build_decision_tendencies_summary
from .habits import build_habit_insights


def _build_cross_domain_transfer(profile: PlayerCognitiveProfile) -> list[DomainTransfer]:
    """Section 3: Cross-domain transfer mapping. Rule-based from traits only."""
    a = profile.aggression_vs_passivity_index
    c = profile.loss_aversion_coefficient
    t = profile.tilt_susceptibility
    s = profile.time_pressure_sensitivity
    d = profile.decision_consistency

    domains = []

    # Negotiation
    strength = (
        "Likely strength in creating value and claiming share when assertiveness is calibrated."
        if a is not None and a >= 40 else
        "Likely strength in listening and finding mutually acceptable outcomes when patience is valued."
    )
    failure = (
        "Possible failure mode: over-committing or escalating when the other side needs space."
        if a is not None and a >= 60 else
        "Possible failure mode: conceding too much or failing to assert interests when the other side is aggressive."
    )
    adjustment = (
        "Mental adjustment: pausing to separate 'what I want' from 'what I need' before responding under pressure."
    )
    domains.append(DomainTransfer(domain="Negotiation", likely_strength=strength, likely_failure_mode=failure, mental_adjustment=adjustment))

    # Trading / investing
    strength = (
        "Likely strength in sticking to a plan and avoiding impulsive trades when loss aversion is moderate."
        if c is not None and c >= 1.0 else
        "Likely strength in taking calculated risks when loss aversion is lower, if combined with discipline."
    )
    failure = (
        "Possible failure mode: holding losing positions too long or avoiding necessary risk to avoid realizing losses."
        if c is not None and c >= 1.5 else
        "Possible failure mode: taking excessive risk or not protecting capital when losses are underweighted."
    )
    adjustment = (
        "Mental adjustment: writing down entry and exit rules in advance and reviewing them when emotional."
    )
    domains.append(DomainTransfer(domain="Trading / investing", likely_strength=strength, likely_failure_mode=failure, mental_adjustment=adjustment))

    # Competitive interviews
    strength = (
        "Likely strength in projecting confidence and taking initiative when assertiveness is higher."
        if a is not None and a >= 50 else
        "Likely strength in thoughtful answers and rapport when passivity is framed as listening and reflection."
    )
    failure = (
        "Possible failure mode: coming across as overbearing or not leaving space for the interviewer."
        if a is not None and a >= 70 else
        "Possible failure mode: under-selling achievements or waiting too long to speak up."
    )
    adjustment = (
        "Mental adjustment: preparing a few concrete examples in advance to reduce the effect of time pressure on recall."
    )
    domains.append(DomainTransfer(domain="Competitive interviews", likely_strength=strength, likely_failure_mode=failure, mental_adjustment=adjustment))

    # High-stakes decision-making meetings
    strength = (
        "Likely strength when consistency is higher: others can anticipate and align with your decision style."
        if d is not None and d >= 0.5 else
        "Likely strength when adaptability is needed: shifting approach as new information appears."
    )
    failure = (
        "Possible failure mode: decision quality dropping under time pressure or after a prior setback."
        if (s is not None and s >= 0.5) or (t is not None and t >= 0.5) else
        "Possible failure mode: sticking to a plan when the meeting reveals that the plan is wrong."
    )
    adjustment = (
        "Mental adjustment: scheduling a short break before or after the meeting to reset if stress or tilt is a factor."
    )
    domains.append(DomainTransfer(domain="High-stakes decision-making meetings", likely_strength=strength, likely_failure_mode=failure, mental_adjustment=adjustment))

    return domains


def _build_stress_response_profile(profile: PlayerCognitiveProfile) -> StressResponseProfile:
    """Section 4: Cognitive load and stress response. Descriptive, uncertainty-aware."""
    t = profile.tilt_susceptibility
    s = profile.time_pressure_sensitivity
    d = profile.decision_consistency

    if t is not None and t >= 0.6:
        quality_under_stress = (
            "The profile suggests that decision quality may be more likely to degrade after setbacks or conflict. "
            "People with this pattern often benefit from structured pauses before important subsequent decisions."
        )
    elif t is not None and t >= 0.3:
        quality_under_stress = (
            "The profile suggests moderate susceptibility to stress affecting decisions. "
            "Some degradation under high stress is possible; self-regulation and breaks can help."
        )
    else:
        quality_under_stress = (
            "The profile suggests that decision quality may hold up relatively well under stress, "
            "though extreme or prolonged stress can affect anyone. Confidence in this inference depends on data quality."
        )

    if s is not None and s >= 0.6:
        time_effects = (
            "Time pressure may reduce depth of reasoning and increase reliance on habits or heuristics. "
            "Important nuances may be missed when deadlines are tight."
        )
    elif s is not None and s >= 0.3:
        time_effects = (
            "Time pressure may have a moderate effect: some decisions hold up, others may be more error-prone. "
            "Individual and situational variation is likely."
        )
    else:
        time_effects = (
            "The profile suggests that reasoning may hold up reasonably well under time pressure. "
            "Very short deadlines or high complexity can still degrade performance."
        )

    if d is not None and d >= 0.6:
        simpl_vs_explore = (
            "Under stress, people with more consistent profiles may tend toward simplification—relying on "
            "established rules or habits. This can stabilize outcomes when the situation matches those rules; "
            "exploration of new options may be reduced."
        )
    else:
        simpl_vs_explore = (
            "Under stress, decision patterns may shift more; sometimes simplification helps (fewer options, "
            "clear rules), sometimes exploration helps (considering alternatives). The profile does not strongly "
            "indicate one as generally better—context matters."
        )

    uncertainty = [
        "These inferences are based only on the cognitive profile; real-world stress depends on context and history.",
        "Individual differences within the same profile are expected; treat as tendencies, not guarantees.",
    ]

    return StressResponseProfile(
        decision_quality_under_stress=quality_under_stress,
        time_pressure_effects=time_effects,
        simplification_vs_exploration=simpl_vs_explore,
        uncertainty_notes=uncertainty,
    )


def _build_summary_card(
    tendencies: list[TraitTendencySummary],
    habits: list[HabitInsight],
    profile: PlayerCognitiveProfile,
) -> SummaryCard:
    """Section 5: Human-readable one-page summary. Top 3s and confidence."""
    # Dominant traits: use profile values to pick; fallback to order
    trait_scores = [
        ("Risk tolerance", 0.5),
        ("Loss aversion", profile.loss_aversion_coefficient or 0.5),
        ("Aggression vs passivity", (profile.aggression_vs_passivity_index or 50) / 100.0),
        ("Tilt susceptibility", profile.tilt_susceptibility or 0.5),
        ("Time-pressure sensitivity", profile.time_pressure_sensitivity or 0.5),
        ("Decision consistency", profile.decision_consistency or 0.5),
    ]
    # Dominant = those that are likely to drive behavior (e.g. further from 0.5 or from neutral)
    def salience(t: tuple[str, float]) -> float:
        name, v = t
        if name == "Aggression vs passivity":
            return abs(v - 0.5)
        return abs(v - 0.5)

    sorted_traits = sorted(trait_scores, key=salience, reverse=True)
    top_3_dominant = []
    for t in sorted_traits[:3]:
        tt = next((x for x in tendencies if x.trait_name == t[0]), None)
        if tt:
            desc = tt.cognitive_interpretation[:100] + "..." if len(tt.cognitive_interpretation) > 100 else tt.cognitive_interpretation
            top_3_dominant.append((t[0], desc))
        else:
            top_3_dominant.append((t[0], "See full report for interpretation."))

    # Risk patterns: from tendencies' situations_harmful
    risk_entries = []
    for tt in tendencies:
        for sit in (tt.situations_harmful or [])[:1]:
            risk_entries.append((tt.trait_name, sit))
    top_3_risks = risk_entries[:3] if risk_entries else [("General", "Context-dependent risks; review full report for your profile.")]

    # Transferable habits: from habits, one per trait, take first three
    habit_entries = []
    for h in habits:
        if h.protective_habits:
            habit_entries.append((h.trait_name, h.protective_habits[0]))
    top_3_habits = habit_entries[:3] if habit_entries else [("General", "Review habit insights in the full report.")]

    confidence = (
        "Confidence in this summary depends on the completeness and quality of the underlying profile. "
        "Scores with higher trait confidence and more data generally yield more reliable inferences. "
        "Treat this as a starting point for reflection, not a fixed diagnosis."
    )

    return SummaryCard(
        top_3_dominant_traits=top_3_dominant,
        top_3_decision_risk_patterns=top_3_risks,
        top_3_transferable_habits=top_3_habits,
        confidence_levels=confidence,
    )


def generate_report(profile: PlayerCognitiveProfile) -> DecisionTransferReport:
    """
    Build a DecisionTransferReport from a PlayerCognitiveProfile.
    Deterministic, rule-based only. Profile is read-only and not modified.
    """
    tendencies = build_decision_tendencies_summary(profile)
    habit_insights = build_habit_insights(profile)
    cross_domain = _build_cross_domain_transfer(profile)
    stress_profile = _build_stress_response_profile(profile)
    summary_card = _build_summary_card(tendencies, habit_insights, profile)

    return DecisionTransferReport(
        decision_tendencies_summary=tendencies,
        habit_insights=habit_insights,
        cross_domain_transfer=cross_domain,
        cognitive_load_stress_profile=stress_profile,
        summary_card=summary_card,
    )
