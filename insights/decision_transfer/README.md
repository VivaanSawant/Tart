# Decision Transfer Module

**Decision transfer** is a standalone interpretation and habit-formation layer that translates a player's **existing cognitive profile** into general human decision-making insights. It is designed to help people understand their own decision patterns, surface transferable habits, and generalize cognition to real-world contexts—without improving poker performance, recommending explicit actions, or influencing gameplay or agents.

---

## Integration with the Existing Player Profile

- This module integrates **solely** with the existing **Player Profile** integration.
- It **consumes only** the existing `PlayerCognitiveProfile` object as currently exposed by that integration.
- It **does not modify** the Player Profile code, schema, or integration layer. The profile is treated as **immutable and read-only**.
- No other inputs are permitted: the module does not read poker hands, actions, EV values, game state, or bot outputs.
- No new dependencies are introduced upstream. The module is **deterministic and rule-based** (no machine learning or retraining) and remains **fully explainable**.

**How to use:** Whatever system currently exposes or will expose a `PlayerCognitiveProfile` (with fields such as risk tolerance curve, loss aversion coefficient, aggression vs passivity index, tilt susceptibility, time-pressure sensitivity, decision consistency, and trait confidence scores) can pass that object into this module. The module then produces a `DecisionTransferReport` containing:

1. **Decision Tendencies Summary** — Cognitive interpretation, typical manifestations, and advantageous vs harmful situations per trait (probabilistic, uncertainty-aware).
2. **Habit-Level Insights** — Reflective, non-prescriptive protective habits, corrective habits, and early warning signals per trait.
3. **Cross-Domain Transfer Mapping** — Implications for negotiation, trading/investing, competitive interviews, and high-stakes meetings (likely strength, failure mode, mental adjustment).
4. **Cognitive Load & Stress Response Profile** — How decision quality may change under stress and time pressure, and when simplification vs exploration may perform better.
5. **Human-Readable Summary Card** — Top 3 dominant traits, top 3 decision risk patterns, top 3 transferable habits, and confidence levels for non-technical users.

```python
from insights.decision_transfer import PlayerCognitiveProfile, generate_report

# Obtain profile from the existing Player Profile integration (read-only).
profile = ...  # e.g. from your existing integration

report = generate_report(profile)
# Use report.decision_tendencies_summary, report.habit_insights,
# report.cross_domain_transfer, report.cognitive_load_stress_profile,
# report.summary_card as needed.
```

---

## Ethical Boundaries

- **This module must NOT improve poker performance directly.** It does not suggest or optimize for better poker play.
- **This module must NOT recommend explicit actions** in any domain. Insights are reflective and descriptive (e.g. "People with this profile often benefit from…") rather than prescriptive ("You should do X").
- **This module must NOT influence gameplay or agents.** It does not feed into betting logic, bots, or any system that affects how the game is played. It exists only to enhance **human self-awareness and decision quality** in a general sense.
- **Human decision support over optimization.** The goal is to help users understand their own patterns and transferable habits, not to optimize their behavior in any specific context.

---

## File Layout

| File | Purpose |
|------|--------|
| `report_schema.py` | Defines the read-only input contract (`PlayerCognitiveProfile`) and the output structure (`DecisionTransferReport` and related dataclasses). |
| `trait_mappings.py` | Rule-based mappings from each cognitive trait to decision tendency summaries (interpretation, manifestations, advantageous/harmful situations). |
| `habits.py` | Reflective habit-level insights per trait (protective habits, corrective habits, early warning signals). |
| `transfer_engine.py` | Orchestrates report generation: calls trait mappings and habits, builds cross-domain transfer, stress profile, and summary card. |
| `README.md` | This file: integration, ethics, and usage. |

---

## Technical Requirements (Summary)

- **Deterministic, rule-based logic only** — no ML or retraining.
- **Fully explainable mappings** — every output can be traced to profile fields and explicit rules.
- **Clean separation** from analytics and agents — no shared state or side effects on gameplay.
- **Compatible with the existing Player Profile integration** — consumes the profile as-is; does not alter it or its schema.
