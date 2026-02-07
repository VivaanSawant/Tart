"""
Reflective, non-prescriptive habit-level insights derived from cognitive traits.
Rule-based; no actions prescribed. Uses reflective phrasing and early-warning signals.
"""

from __future__ import annotations

from .report_schema import PlayerCognitiveProfile, HabitInsight


def _habits_risk_tolerance(profile: PlayerCognitiveProfile) -> HabitInsight:
    return HabitInsight(
        trait_name="Risk tolerance",
        protective_habits=[
            "People with this profile often benefit from periodically checking whether their current risk level still matches their goals.",
            "Many find it helpful to have a simple rule for when to re-evaluate stakes (e.g., after a major win or loss).",
            "Some maintain stability by separating 'practice' or low-stakes contexts from high-stakes ones mentally.",
        ],
        corrective_habits=[
            "When risk tolerance shifts with mood, people sometimes benefit from delaying large commitments until a calmer state.",
            "Reviewing past decisions in similar situations can reduce the impact of framing on future risk choices.",
        ],
        early_warning_signals=[
            "Noticing that the same type of decision feels 'obvious' in one context and 'too risky' in another without a clear reason.",
            "Repeatedly regretting either over-caution or over-boldness after the fact.",
        ],
    )


def _habits_loss_aversion(profile: PlayerCognitiveProfile) -> HabitInsight:
    c = profile.loss_aversion_coefficient
    return HabitInsight(
        trait_name="Loss aversion",
        protective_habits=[
            "People with this profile often benefit from explicitly weighing gains and losses in comparable terms before deciding.",
            "Many find it useful to set in advance what 'acceptable loss' means, so the emotional weight of loss does not override that frame.",
            "Some stabilize decisions by focusing on process (e.g., 'Did I follow my plan?') rather than only on outcome.",
        ],
        corrective_habits=[
            "When stuck on avoiding a loss, people sometimes benefit from asking how they would advise someone else in the same situation.",
            "Reframing a decision in terms of opportunity cost (what is lost by not acting) can balance the pull of loss avoidance.",
        ],
        early_warning_signals=[
            "Holding on to a losing position or commitment mainly to avoid 'locking in' the loss.",
            "Strong reluctance to take a risk that has positive expected value but a chance of immediate loss.",
        ],
    )


def _habits_aggression_passivity(profile: PlayerCognitiveProfile) -> HabitInsight:
    a = profile.aggression_vs_passivity_index
    return HabitInsight(
        trait_name="Aggression vs passivity",
        protective_habits=[
            "People with this profile often benefit from noticing when they default to initiating versus waiting, and whether that fits the situation.",
            "Many find it helpful to have a brief pause before committing in competitive or ambiguous situations.",
            "Some maintain balance by deliberately seeking one opposing move (e.g., one assertive and one observant action) in high-stakes periods.",
        ],
        corrective_habits=[
            "When passivity may be costly, people sometimes benefit from setting a deadline by which they will act or speak up.",
            "When assertiveness may be costly, people sometimes benefit from asking one more question or waiting one more round before committing.",
        ],
        early_warning_signals=[
            "Consistently feeling that others 'got there first' or that one's own view was never heard.",
            "Repeated feedback that one is too pushy or too hesitant, without a clear situational pattern.",
        ],
    )


def _habits_tilt_susceptibility(profile: PlayerCognitiveProfile) -> HabitInsight:
    return HabitInsight(
        trait_name="Tilt susceptibility",
        protective_habits=[
            "People with this profile often benefit from a short break or routine (e.g., a walk, breath, or pause) after a setback before the next decision.",
            "Many find it useful to recognize physical or emotional signs that tilt may be building (e.g., faster heart rate, rumination).",
            "Some stabilize performance by having a pre-agreed rule to reduce stakes or pause after a certain number of negative outcomes.",
        ],
        corrective_habits=[
            "When emotions are high, people sometimes benefit from deferring irreversible decisions to a calmer moment.",
            "Reviewing what went wrong after the fact, rather than in the moment, can reduce the urge to 'fix it immediately' in ways that worsen outcomes.",
        ],
        early_warning_signals=[
            "Making a decision that feels urgent and right in the moment but wrong in hindsight after a loss or conflict.",
            "Noticing that the next few decisions after a setback are more impulsive or more aggressive than usual.",
        ],
    )


def _habits_time_pressure(profile: PlayerCognitiveProfile) -> HabitInsight:
    return HabitInsight(
        trait_name="Time-pressure sensitivity",
        protective_habits=[
            "People with this profile often benefit from building buffer time into schedules before important decisions.",
            "Many find it helpful to identify in advance the one or two criteria that matter most when time is short, so focus does not scatter.",
            "Some reduce errors under pressure by using checklists or fixed sequences for repeated high-stakes decisions.",
        ],
        corrective_habits=[
            "When a deadline is imposed externally, people sometimes benefit from asking for a short extension or clarifying what is truly due when.",
            "Reflecting after time-pressured decisions on what was missed can improve the next round of quick choices.",
        ],
        early_warning_signals=[
            "Realizing only after the fact that a key factor was ignored because of time pressure.",
            "Noticing that the quality of decisions drops noticeably when deadlines are tight.",
        ],
    )


def _habits_decision_consistency(profile: PlayerCognitiveProfile) -> HabitInsight:
    return HabitInsight(
        trait_name="Decision consistency",
        protective_habits=[
            "People with this profile often benefit from writing down the principle or rule they are using for a class of decisions, and revisiting it periodically.",
            "Many find it useful to compare current choices to past ones in similar situations before finalizing.",
            "Some maintain consistency by having a small set of explicit criteria that they apply across contexts.",
        ],
        corrective_habits=[
            "When unsure why two similar situations led to different choices, people sometimes benefit from a short review to see if the difference was intentional or accidental.",
            "When feedback suggests inconsistency, explicitly listing the intended policy can reduce drift.",
        ],
        early_warning_signals=[
            "Giving different answers to the same type of question depending on mood or who is asking.",
            "Finding it hard to explain why one chose A in one case and B in another without a clear distinguishing factor.",
        ],
    )


def build_habit_insights(profile: PlayerCognitiveProfile) -> list[HabitInsight]:
    """Produce Section 2: Habit-level insights for all traits. Deterministic and reflective."""
    return [
        _habits_risk_tolerance(profile),
        _habits_loss_aversion(profile),
        _habits_aggression_passivity(profile),
        _habits_tilt_susceptibility(profile),
        _habits_time_pressure(profile),
        _habits_decision_consistency(profile),
    ]
