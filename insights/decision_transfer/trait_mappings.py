"""
Rule-based mappings from PlayerCognitiveProfile traits to decision tendency
interpretations. Deterministic and fully explainable; no ML.
All language is probabilistic and uncertainty-aware.
"""

from __future__ import annotations

from .report_schema import PlayerCognitiveProfile, TraitTendencySummary


def _confidence_note(score: float | None) -> str:
    if score is None:
        return "Confidence in this inference is limited when the underlying trait score is unavailable."
    if score >= 0.8:
        return "Higher confidence in this interpretation given the available profile."
    if score >= 0.5:
        return "Moderate confidence; individual variation is likely."
    return "Lower confidence; consider this as one possible pattern among others."


def _get_confidence(profile: PlayerCognitiveProfile, trait_key: str) -> float | None:
    scores = profile.trait_confidence_scores
    if not scores:
        return None
    return scores.get(trait_key)


# ---------------------------------------------------------------------------
# Risk tolerance curve
# ---------------------------------------------------------------------------

def _interpret_risk_tolerance(profile: PlayerCognitiveProfile) -> TraitTendencySummary:
    curve = profile.risk_tolerance_curve
    conf = _get_confidence(profile, "risk_tolerance")

    if curve is None:
        return TraitTendencySummary(
            trait_name="Risk tolerance",
            cognitive_interpretation=(
                "Without a clear risk-tolerance curve, people often exhibit context-dependent risk-taking. "
                "Some may be more risk-seeking when stakes feel low and more cautious when stakes rise; "
                "others may show the opposite pattern."
            ),
            typical_decision_manifestations=[
                "Decisions may shift between cautious and bold depending on how stakes are framed.",
                "Willingness to commit may vary noticeably across situations.",
            ],
            situations_advantageous=[
                "Situations where a stable risk posture is not critical.",
                "Contexts where calibration can happen through feedback.",
            ],
            situations_harmful=[
                "One-off high-stakes decisions where consistency matters.",
                "Environments where others can exploit inconsistent risk-taking.",
            ],
            confidence_note=_confidence_note(conf),
        )

    # Simple heuristic: if curve is list of (x,y), interpret slope/shape
    if isinstance(curve, list) and len(curve) >= 2:
        # Compare first and last y-values as rough "low vs high stake" tolerance
        y_vals = [p[1] for p in curve if len(p) >= 2]
        if y_vals:
            avg_low = sum(y_vals[: len(y_vals) // 2]) / max(1, len(y_vals) // 2)
            avg_high = sum(y_vals[len(y_vals) // 2 :]) / max(1, len(y_vals) - len(y_vals) // 2)
            if avg_high > avg_low + 0.1:
                interp = (
                    "The profile suggests a tendency for risk tolerance to increase as stakes rise, "
                    "which may reflect either confidence under pressure or a tendency to escalate commitment. "
                    "This pattern is often observed but not universal."
                )
                harmful = [
                    "Situations where escalating commitment leads to large, irreversible losses.",
                    "Contexts where 'doubling down' is penalized.",
                ]
            elif avg_low > avg_high + 0.1:
                interp = (
                    "The profile suggests higher risk tolerance when stakes are perceived as lower, "
                    "and more caution when stakes rise. This may support prudent high-stakes decisions "
                    "but can sometimes limit upside when boldness is rewarded."
                )
                harmful = [
                    "Opportunities that require consistent boldness across stake levels.",
                    "Environments where others take more risk and capture disproportionate gains.",
                ]
            else:
                interp = (
                    "The profile suggests relatively stable risk tolerance across stake levels. "
                    "This can support consistent decision-making, though individual context may still vary."
                )
                harmful = [
                    "Situations where optimal behavior requires deliberately shifting risk by context.",
                ]
        else:
            interp = "Risk tolerance appears to vary by context; exact pattern is uncertain."
            harmful = []
    else:
        interp = (
            "The risk tolerance pattern in the profile may indicate how comfortable a person is "
            "with uncertainty and potential loss at different levels. Interpretation depends on "
            "the specific curve shape; general patterns are probabilistic."
        )
        harmful = [
            "High-stakes, one-shot decisions where mis-calibration is costly.",
        ]

    return TraitTendencySummary(
        trait_name="Risk tolerance",
        cognitive_interpretation=interp,
        typical_decision_manifestations=[
            "Choices may cluster toward safer or riskier options depending on how stakes are perceived.",
            "Reaction to losses and gains may influence subsequent risk-taking.",
        ],
        situations_advantageous=[
            "Repeated decisions where learning and calibration are possible.",
            "Settings where personal risk preference is well-matched to the environment.",
        ],
        situations_harmful=harmful,
        confidence_note=_confidence_note(conf),
    )


# ---------------------------------------------------------------------------
# Loss aversion
# ---------------------------------------------------------------------------

def _interpret_loss_aversion(profile: PlayerCognitiveProfile) -> TraitTendencySummary:
    c = profile.loss_aversion_coefficient
    conf = _get_confidence(profile, "loss_aversion")

    if c is None:
        interp = (
            "Loss aversion is a common human bias: losses often weigh more than equivalent gains. "
            "Without a specific coefficient, the degree of this bias is uncertain; many people "
            "show moderate to strong loss aversion."
        )
    elif c >= 2.0:
        interp = (
            "The profile suggests relatively strong loss aversion. People with this pattern often "
            "weight potential losses more heavily than gains, which may lead to avoiding necessary "
            "risks or holding on to losing positions too long to 'avoid realizing a loss.'"
        )
    elif c >= 1.2:
        interp = (
            "The profile suggests moderate loss aversion, in line with commonly observed ranges. "
            "Decisions may be somewhat skewed toward avoiding losses, with gains valued less than "
            "equivalent losses in emotional or behavioral impact."
        )
    else:
        interp = (
            "The profile suggests lower-than-typical loss aversion. This may support willingness "
            "to take calculated risks and accept short-term losses for potential gain, though "
            "it can also increase exposure to repeated small losses if not tempered."
        )

    return TraitTendencySummary(
        trait_name="Loss aversion",
        cognitive_interpretation=interp,
        typical_decision_manifestations=[
            "Reluctance to close out or reverse losing positions.",
            "Stronger reaction to framing that emphasizes potential loss than to equivalent gain framing.",
            "Possible preference for certainty over higher expected value when loss is salient.",
        ],
        situations_advantageous=[
            "Settings where avoiding large drawdowns is more important than maximizing upside.",
            "Long-term commitments where short-term losses are acceptable for better outcomes.",
        ] if c is None or c < 1.5 else [
            "Situations where capital preservation is paramount.",
            "Contexts where avoiding irreversible losses matters more than capturing every gain.",
        ],
        situations_harmful=[
            "Opportunities that require accepting short-term loss for long-term gain.",
            "Negotiations or decisions where counterparties can exploit loss-averse behavior.",
        ],
        confidence_note=_confidence_note(conf),
    )


# ---------------------------------------------------------------------------
# Aggression vs passivity
# ---------------------------------------------------------------------------

def _interpret_aggression_passivity(profile: PlayerCognitiveProfile) -> TraitTendencySummary:
    a = profile.aggression_vs_passivity_index
    conf = _get_confidence(profile, "aggression_vs_passivity")

    if a is None:
        interp = (
            "The balance between assertive and passive decision-making varies by person and context. "
            "Without an index value, the profile does not support a strong inference about this dimension."
        )
    elif a >= 70:
        interp = (
            "The profile suggests a tendency toward assertive, action-oriented decisions. "
            "People with this pattern often initiate more, take the lead, and may be comfortable "
            "with conflict or competition. This can be advantageous when boldness is rewarded."
        )
    elif a >= 40:
        interp = (
            "The profile suggests a moderate balance between assertiveness and passivity. "
            "Decisions may adapt to context—more assertive when needed, more reserved when "
            "caution or observation is beneficial."
        )
    else:
        interp = (
            "The profile suggests a tendency toward more passive or reactive decision-making. "
            "People with this pattern may prefer to observe, wait for clarity, or avoid confrontation. "
            "This can reduce unnecessary conflict but may delay or underuse initiative."
        )

    return TraitTendencySummary(
        trait_name="Aggression vs passivity",
        cognitive_interpretation=interp,
        typical_decision_manifestations=[
            "Frequency of initiating versus responding in competitive or collaborative settings.",
            "Comfort with ambiguity and with taking positions before full information.",
            "Tendency to escalate or de-escalate in conflict.",
        ],
        situations_advantageous=[
            "Negotiations or competitions where first movers or assertive communicators gain.",
            "Crisis or time-sensitive contexts where action is valued over deliberation.",
        ] if a is not None and a >= 50 else [
            "Settings where listening and patience lead to better outcomes.",
            "Environments where premature action is penalized.",
        ],
        situations_harmful=[
            "Situations where patience and restraint are more valuable than initiative.",
            "Relationships or cultures where assertiveness is perceived negatively.",
        ] if a is not None and a >= 60 else [
            "Contexts where failing to act quickly or assertively leads to missed opportunities.",
            "Competitive settings where passivity is exploited.",
        ],
        confidence_note=_confidence_note(conf),
    )


# ---------------------------------------------------------------------------
# Tilt susceptibility
# ---------------------------------------------------------------------------

def _interpret_tilt_susceptibility(profile: PlayerCognitiveProfile) -> TraitTendencySummary:
    t = profile.tilt_susceptibility
    conf = _get_confidence(profile, "tilt_susceptibility")

    if t is None:
        interp = (
            "Emotional reactivity under stress or after setbacks varies widely. "
            "Without a tilt-susceptibility measure, the degree to which decisions degrade "
            "after negative events is uncertain."
        )
    elif t >= 0.7:
        interp = (
            "The profile suggests that decisions may be more likely to degrade after losses, "
            "conflict, or frustration. People with this pattern may benefit from explicit "
            "pauses or routines that restore calm before important subsequent decisions."
        )
    elif t >= 0.4:
        interp = (
            "The profile suggests moderate susceptibility to emotional swings affecting decisions. "
            "Some periods of stress or setback may influence choices; recovery and self-regulation "
            "can help maintain quality."
        )
    else:
        interp = (
            "The profile suggests relatively stable decision-making under emotional provocation. "
            "Even so, extreme stress or repeated setbacks can affect anyone; this pattern indicates "
            "possible resilience rather than immunity."
        )

    return TraitTendencySummary(
        trait_name="Tilt susceptibility",
        cognitive_interpretation=interp,
        typical_decision_manifestations=[
            "Quality of decisions may drop after a recent loss or negative feedback.",
            "Increased risk-taking or aggression following frustration.",
            "Tendency to override usual rules or boundaries when upset.",
        ],
        situations_advantageous=[
            "Calm, low-pressure environments where emotional triggers are rare.",
            "Structured processes that force a pause after emotional events.",
        ],
        situations_harmful=[
            "Back-to-back high-stakes decisions after a setback.",
            "Situations where counterparties can provoke or exploit emotional reactions.",
            "Environments with frequent negative feedback or conflict.",
        ],
        confidence_note=_confidence_note(conf),
    )


# ---------------------------------------------------------------------------
# Time-pressure sensitivity
# ---------------------------------------------------------------------------

def _interpret_time_pressure(profile: PlayerCognitiveProfile) -> TraitTendencySummary:
    s = profile.time_pressure_sensitivity
    conf = _get_confidence(profile, "time_pressure_sensitivity")

    if s is None:
        interp = (
            "People differ in how much time pressure affects their reasoning and choices. "
            "Without a sensitivity measure, the impact of deadlines and urgency is uncertain."
        )
    elif s >= 0.7:
        interp = (
            "The profile suggests that decision quality may be more affected by time pressure. "
            "Under deadlines, people with this pattern may rush, simplify too much, or rely on "
            "heuristics that do not fit the situation."
        )
    elif s >= 0.4:
        interp = (
            "The profile suggests moderate sensitivity to time pressure. Some decisions under "
            "urgency may hold up well; others may show more errors or reliance on habit."
        )
    else:
        interp = (
            "The profile suggests that decisions may hold up relatively well under time pressure. "
            "Even so, very short deadlines or high complexity can degrade anyone's judgment."
        )

    return TraitTendencySummary(
        trait_name="Time-pressure sensitivity",
        cognitive_interpretation=interp,
        typical_decision_manifestations=[
            "Shifts in accuracy or consistency when deadlines are tight.",
            "Greater reliance on intuition or habit under urgency.",
            "Possible omission of important steps when rushed.",
        ],
        situations_advantageous=[
            "Settings with adequate time for reflection and analysis.",
            "Processes that build in buffer time before commitments.",
        ],
        situations_harmful=[
            "Real-time or rapid-response decisions with lasting consequences.",
            "Environments where others use time pressure to force quick commitments.",
        ],
        confidence_note=_confidence_note(conf),
    )


# ---------------------------------------------------------------------------
# Decision consistency
# ---------------------------------------------------------------------------

def _interpret_decision_consistency(profile: PlayerCognitiveProfile) -> TraitTendencySummary:
    d = profile.decision_consistency
    conf = _get_confidence(profile, "decision_consistency")

    if d is None:
        interp = (
            "Consistency of decisions across similar situations is a dimension of judgment quality. "
            "Without a consistency measure, the degree of stability in applying similar principles "
            "is uncertain."
        )
    elif d >= 0.7:
        interp = (
            "The profile suggests relatively consistent application of similar principles across "
            "comparable situations. This can support trust and predictability, though it may "
            "sometimes reduce flexibility when adaptation is needed."
        )
    elif d >= 0.4:
        interp = (
            "The profile suggests moderate consistency. Some situations may trigger similar "
            "responses; others may show more variation due to context or mood."
        )
    else:
        interp = (
            "The profile suggests that decisions may vary more across similar contexts. "
            "This can reflect adaptability but may also indicate sensitivity to framing, "
            "fatigue, or unstable criteria."
        )

    return TraitTendencySummary(
        trait_name="Decision consistency",
        cognitive_interpretation=interp,
        typical_decision_manifestations=[
            "Similar situations may or may not lead to similar choices depending on framing or state.",
            "Stability of priorities and trade-offs over time.",
        ],
        situations_advantageous=[
            "Contexts where predictable behavior builds trust or allows coordination.",
            "Repeated decisions where consistency improves outcomes.",
        ],
        situations_harmful=[
            "Environments where others can probe for and exploit inconsistencies.",
            "Situations where past commitments conflict with current choices.",
        ],
        confidence_note=_confidence_note(conf),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_decision_tendencies_summary(profile: PlayerCognitiveProfile) -> list[TraitTendencySummary]:
    """Produce Section 1: Decision Tendencies Summary for all traits. Deterministic."""
    return [
        _interpret_risk_tolerance(profile),
        _interpret_loss_aversion(profile),
        _interpret_aggression_passivity(profile),
        _interpret_tilt_susceptibility(profile),
        _interpret_time_pressure(profile),
        _interpret_decision_consistency(profile),
    ]
