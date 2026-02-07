import { useState, useMemo, useCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { fetchDecisionTransferReport } from '../api/backend'
import './MoveLog.css'

// If actual raise exceeds suggested raise by this much (e.g. 0.25 = 25%), flag as BLUFF
const BLUFF_OVER_RAISE_PERCENT = 0.25

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  return '$' + Number(val).toFixed(2)
}

function isBluffRaise(move) {
  const act = (move?.action || '').toLowerCase()
  if (act !== 'raise') return false
  const amount = Number(move?.amount)
  const suggested = Number(move?.suggestedRaise)
  if (amount == null || Number.isNaN(amount) || suggested == null || Number.isNaN(suggested) || suggested <= 0) return false
  return amount > suggested * (1 + BLUFF_OVER_RAISE_PERCENT)
}

function computeStats(moves) {
  const total = moves.length
  if (total === 0) return null

  const matched = moves.filter((m) => {
    const a = (m.action || '').toLowerCase()
    const o = (m.optimalMove || 'no_bet').toLowerCase()
    return a === o || (a === 'check' && o === 'no_bet')
  }).length

  const byAction = { call: 0, fold: 0, raise: 0, check: 0 }
  const byOptimal = { call: 0, fold: 0, raise: 0, check: 0, no_bet: 0 }
  const byStreet = { preflop: 0, flop: 0, turn: 0, river: 0 }
  const streetCorrect = { preflop: 0, flop: 0, turn: 0, river: 0 }
  const equityValues = []
  const raiseComparisons = []
  let bluffCount = 0
  const bluffByStreet = { preflop: 0, flop: 0, turn: 0, river: 0 }
  const bluffEquityValues = []

  moves.forEach((m) => {
    const a = (m.action || '').toLowerCase()
    const o = (m.optimalMove || 'no_bet').toLowerCase()
    const optNorm = o === 'no_bet' ? 'check' : o
    if (a) byAction[a] = (byAction[a] || 0) + 1
    if (optNorm) byOptimal[optNorm] = (byOptimal[optNorm] || 0) + 1
    if (m.street) byStreet[m.street] = (byStreet[m.street] || 0) + 1
    const isCorrect = a === o || (a === 'check' && o === 'no_bet')
    if (m.street) streetCorrect[m.street] = (streetCorrect[m.street] || 0) + (isCorrect ? 1 : 0)
    if (m.equity != null) equityValues.push(Number(m.equity))
    if (a === 'raise' && m.amount != null && m.suggestedRaise != null) raiseComparisons.push({ actual: m.amount, optimal: m.suggestedRaise })
    if (isBluffRaise(m)) {
      bluffCount++
      if (m.street) bluffByStreet[m.street] = (bluffByStreet[m.street] || 0) + 1
      if (m.equity != null) bluffEquityValues.push(Number(m.equity))
    }
  })

  const adherence = total > 0 ? Math.round((matched / total) * 100) : 0
  const avgEquity = equityValues.length ? equityValues.reduce((s, e) => s + e, 0) / equityValues.length : null
  const aggression = total > 0 ? Math.round((((byAction.raise || 0) + (byAction.call || 0) * 0.5) / total) * 100) : 0

  // Current streak (consecutive optimal or deviated at end)
  let optimalStreak = 0
  let deviateStreak = 0
  for (let i = moves.length - 1; i >= 0; i--) {
    const a = (moves[i].action || '').toLowerCase()
    const o = (moves[i].optimalMove || 'no_bet').toLowerCase()
    const isOptimal = a === o || (a === 'check' && o === 'no_bet')
    if (isOptimal) {
      if (deviateStreak > 0) break
      optimalStreak++
    } else {
      if (optimalStreak > 0) break
      deviateStreak++
    }
  }

  // Insights from existing stats (display only)
  const optFold = byOptimal.fold || 0
  const yourFold = byAction.fold || 0
  const foldGap = total > 0 ? Math.round(((yourFold - optFold) / total) * 100) : 0
  const riverTotal = byStreet.river || 0
  const riverCorrect = streetCorrect.river || 0
  const riverPct = riverTotal > 0 ? Math.round((riverCorrect / riverTotal) * 100) : null
  const avgRaiseDiff = raiseComparisons.length
    ? raiseComparisons.reduce((s, r) => s + (r.actual - r.optimal), 0) / raiseComparisons.length
    : null
  const avgEquityWhenBluffing = bluffEquityValues.length
    ? bluffEquityValues.reduce((s, e) => s + e, 0) / bluffEquityValues.length
    : null
  const raiseCount = byAction.raise || 0
  const bluffRate = raiseCount > 0 ? Math.round((bluffCount / raiseCount) * 100) : 0

  return {
    raiseCount,
    total,
    matched,
    adherence,
    avgEquity,
    byAction,
    byOptimal,
    byStreet,
    streetCorrect,
    equityValues,
    raiseComparisons,
    aggression,
    optimalStreak,
    deviateStreak,
    foldGap,
    riverPct,
    avgRaiseDiff,
    bluffCount,
    bluffByStreet,
    avgEquityWhenBluffing,
    bluffRate,
  }
}

function EquityCell({ value }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0
  const intensity = pct / 100
  const r = Math.round(46 + (1 - intensity) * 200)
  const g = Math.round(204 + intensity * 51)
  const b = 46
  return (
    <div className="heatmap-cell equity-cell" style={{ backgroundColor: `rgb(${r},${g},${b})` }} title={`Equity: ${value != null ? value.toFixed(1) : '?'}%`}>
      {value != null ? value.toFixed(0) : '—'}
    </div>
  )
}

/* ---------- Psych assessment diagrams ---------- */
function PsychRadarChart({ dimensions }) {
  const n = dimensions.length
  const cx = 120
  const cy = 120
  const r = 95
  const toPoint = (i, value) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    const v = Math.min(1, Math.max(0, value / 100))
    return [cx + r * v * Math.cos(angle), cy + r * v * Math.sin(angle)]
  }
  const gridPoints = [0.25, 0.5, 0.75, 1].map((level) =>
    dimensions.map((_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2
      return [cx + r * level * Math.cos(angle), cy + r * level * Math.sin(angle)]
    })
  )
  const dataPoints = dimensions.map((d, i) => toPoint(i, d.value))
  const polygonPoints = dataPoints.map((p) => p.join(',')).join(' ')
  const axisLabels = dimensions.map((d, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    const lx = cx + (r + 18) * Math.cos(angle)
    const ly = cy + (r + 18) * Math.sin(angle)
    return { x: lx, y: ly, label: d.label }
  })
  return (
    <Box className="psych-diagram psych-radar" sx={{ position: 'relative' }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary', fontWeight: 600 }}>Behavioral dimensions</Typography>
      <svg viewBox="0 0 240 260" className="psych-radar-svg">
        {gridPoints.map((ring, ri) => (
          <polygon key={ri} points={ring.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(13, 148, 136, 0.2)" strokeWidth="0.8" />
        ))}
        {dimensions.map((_, i) => {
          const end = toPoint(i, 100)
          return <line key={i} x1={cx} y1={cy} x2={end[0]} y2={end[1]} stroke="rgba(13, 148, 136, 0.25)" strokeWidth="0.8" />
        })}
        <polygon points={polygonPoints} fill="rgba(13, 148, 136, 0.25)" stroke="#14b8a6" strokeWidth="2" />
        {axisLabels.map((a, i) => (
          <text key={i} x={a.x} y={a.y} textAnchor="middle" dominantBaseline="middle" className="psych-radar-label">{a.label}</text>
        ))}
      </svg>
    </Box>
  )
}

function ClinicalScale({ label, value, max = 100, lowLabel = 'Low', highLabel = 'High' }) {
  const pct = Math.min(100, Math.max(0, (value ?? 0) / max * 100))
  return (
    <Box className="psych-diagram psych-scale">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>{label}</Typography>
        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>{value ?? '—'}</Typography>
      </Box>
      <Box sx={{ height: 10, borderRadius: 1, bgcolor: 'rgba(51,65,85,0.6)', overflow: 'hidden', position: 'relative' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 1, transition: 'width 0.5s ease' }} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>{lowLabel}</Typography>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>{highLabel}</Typography>
      </Box>
    </Box>
  )
}

function QualityByStageChart({ byStreet = {}, streetCorrect = {} }) {
  const stages = ['preflop', 'flop', 'turn', 'river']
  const values = stages.map((s) => {
    const total = byStreet[s] || 0
    const correct = streetCorrect[s] ?? 0
    return total > 0 ? Math.round((correct / total) * 100) : 0
  })
  const max = Math.max(...values, 1)
  const w = 200
  const h = 56
  const pad = 24
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1 || 1)) * (w - 2 * pad)
    const y = h - pad - (v / max) * (h - 2 * pad)
    return `${x},${y}`
  }).join(' ')
  return (
    <Box className="psych-diagram psych-quality-chart">
      <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: 'text.secondary', fontWeight: 600 }}>Decision quality by stage</Typography>
      <svg viewBox={`0 0 ${w} ${h}`} className="psych-quality-svg">
        <polyline points={points} fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {stages.map((s, i) => (
          <text key={s} x={pad + (i / (stages.length - 1 || 1)) * (w - 2 * pad)} y={h - 4} textAnchor="middle" className="psych-quality-label">{s}</text>
        ))}
      </svg>
    </Box>
  )
}

function DecisionTransferReportView({ report }) {
  const tendencies = report?.decision_tendencies_summary ?? []
  const habits = report?.habit_insights ?? []
  const domains = report?.cross_domain_transfer ?? []
  const stress = report?.cognitive_load_stress_profile
  const summary = report?.summary_card

  return (
    <Stack spacing={3} sx={{ py: 1, pb: 3 }} className="report-view-clinical">
      {summary && (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(15, 23, 42, 0.6)', borderColor: 'primary.light' }}>
          <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 700, mb: 1 }}>CLINICAL SUMMARY</Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>{summary.confidence_levels}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" color="primary">Dominant cognitive traits</Typography>
              {(summary.top_3_dominant_traits || []).map(([name, desc], i) => (
                <Typography key={i} variant="body2" sx={{ mt: 0.5 }}><strong>{name}</strong>: {desc}</Typography>
              ))}
            </Box>
            <Box>
              <Typography variant="subtitle2" color="warning.main">Risk patterns</Typography>
              {(summary.top_3_decision_risk_patterns || []).map(([name, desc], i) => (
                <Typography key={i} variant="body2" sx={{ mt: 0.5 }}><strong>{name}</strong>: {desc}</Typography>
              ))}
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ color: 'success.dark' }}>Protective habits</Typography>
              {(summary.top_3_transferable_habits || []).map(([name, desc], i) => (
                <Typography key={i} variant="body2" sx={{ mt: 0.5 }}><strong>{name}</strong>: {desc}</Typography>
              ))}
            </Box>
          </Box>
        </Paper>
      )}

      {tendencies.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Cognitive tendencies</Typography>
          {tendencies.map((t, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
              <Typography variant="subtitle1">{t.trait_name}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{t.cognitive_interpretation}</Typography>
              {t.typical_decision_manifestations?.length > 0 && (
                <Typography variant="body2" sx={{ mt: 1 }} component="span"><strong>Typical:</strong> {t.typical_decision_manifestations.join(' ')}</Typography>
              )}
              {t.situations_advantageous?.length > 0 && (
                <Typography variant="body2" sx={{ display: 'block', mt: 0.5 }}><strong>Advantageous:</strong> {t.situations_advantageous.join(' ')}</Typography>
              )}
              {t.situations_harmful?.length > 0 && (
                <Typography variant="body2" sx={{ display: 'block', mt: 0.5 }}><strong>Harmful:</strong> {t.situations_harmful.join(' ')}</Typography>
              )}
              {t.confidence_note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{t.confidence_note}</Typography>}
            </Paper>
          ))}
        </Box>
      )}

      {habits.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Protective &amp; corrective patterns</Typography>
          {habits.map((h, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
              <Typography variant="subtitle1">{h.trait_name}</Typography>
              {h.protective_habits?.length > 0 && (
                <Typography variant="body2" sx={{ mt: 0.5 }}><strong>Protective:</strong> {h.protective_habits.join(' ')}</Typography>
              )}
              {h.corrective_habits?.length > 0 && (
                <Typography variant="body2" sx={{ display: 'block', mt: 0.5 }}><strong>Corrective:</strong> {h.corrective_habits.join(' ')}</Typography>
              )}
              {h.early_warning_signals?.length > 0 && (
                <Typography variant="body2" sx={{ display: 'block', mt: 0.5 }}><strong>Early warning:</strong> {h.early_warning_signals.join(' ')}</Typography>
              )}
            </Paper>
          ))}
        </Box>
      )}

      {domains.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Transfer to daily life</Typography>
          {domains.map((d, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
              <Typography variant="subtitle1">{d.domain}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}><strong>Strength:</strong> {d.likely_strength}</Typography>
              <Typography variant="body2" sx={{ display: 'block', mt: 0.5 }}><strong>Failure mode:</strong> {d.likely_failure_mode}</Typography>
              <Typography variant="body2" sx={{ display: 'block', mt: 0.5 }}><strong>Adjustment:</strong> {d.mental_adjustment}</Typography>
            </Paper>
          ))}
        </Box>
      )}

      {stress && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'primary.light' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Stress response &amp; cognitive load</Typography>
          <Typography variant="body2">{stress.decision_quality_under_stress}</Typography>
          <Typography variant="body2" sx={{ display: 'block', mt: 1 }}>{stress.time_pressure_effects}</Typography>
          <Typography variant="body2" sx={{ display: 'block', mt: 1 }}>{stress.simplification_vs_exploration}</Typography>
          {(stress.uncertainty_notes || []).map((n, i) => (
            <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{n}</Typography>
          ))}
        </Paper>
      )}
    </Stack>
  )
}

export default function MoveLog({ moves = [] }) {
  const [hoveredMove, setHoveredMove] = useState(null)
  const [expandedMove, setExpandedMove] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState(null)
  const stats = useMemo(() => computeStats(moves), [moves])

  const handleOpenDecisionReport = useCallback(async () => {
    setReportOpen(true)
    setReportData(null)
    setReportError(null)
    setReportLoading(true)
    const profile = {
      aggression: stats?.aggression,
      adherence: stats?.adherence,
      byAction: stats?.byAction,
      bluffCount: stats?.bluffCount,
      bluffRate: stats?.bluffRate,
      bluffByStreet: stats?.bluffByStreet,
      avgEquityWhenBluffing: stats?.avgEquityWhenBluffing,
      totalMoves: stats?.total,
    }
    const res = await fetchDecisionTransferReport(profile)
    setReportLoading(false)
    if (res.ok) setReportData(res.report)
    else setReportError(res.error || 'Could not load report')
  }, [stats])

  if (moves.length === 0) {
    return (
      <Box sx={{ maxWidth: 800, mx: 'auto' }} className="move-log move-log--clinical">
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, color: 'primary.main' }} className="assessment-page-title">
          Behavioral &amp; Cognitive Assessment
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
          No assessment data yet. Play hands to generate your psychological profile. This tool uses decision patterns under uncertainty to surface insights at the intersection of <strong>entertainment and mental health awareness</strong> — for self-reflection only, not a clinical diagnosis.
        </Typography>
      </Box>
    )
  }

  const maxAction = Math.max(...Object.values(stats.byAction).filter(Boolean), ...Object.values(stats.byOptimal).filter(Boolean), 1)

  function formatTimestamp(ts) {
    if (ts == null) return null
    const d = new Date(ts)
    const now = Date.now()
    const diff = (now - d) / 1000
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <Box className="move-log move-log--clinical" sx={{ maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }} className="assessment-page-title">
          Behavioral &amp; Cognitive Assessment
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Entertainment × healthcare — decision patterns under uncertainty for self-awareness. Not a clinical diagnosis.
        </Typography>
      </Box>

      {/* Assessment indicators */}
      <section className="move-log-section insights-section insights-section--clinical">
        <h2 className="section-title section-title--clinical">Assessment indicators</h2>
        <div className="insights-grid">
          <div className="insight-card insight-card--clinical">
            <span className="insight-value insight-value--clinical">{stats.adherence}%</span>
            <span className="insight-label">Decision consistency — alignment with rational baseline</span>
          </div>
          <div className="insight-card insight-card--clinical">
            <span className="insight-value insight-value--clinical">{stats.aggression}</span>
            <span className="insight-label">Behavioral activation index (0–100)</span>
          </div>
          {stats.riverPct != null && (
            <div className="insight-card insight-card--clinical">
              <span className="insight-value insight-value--clinical">{stats.riverPct}%</span>
              <span className="insight-label">Decision quality under high pressure (river)</span>
            </div>
          )}
          {stats.avgRaiseDiff != null && (
            <div className="insight-card insight-card--clinical">
              <span className="insight-value insight-value--clinical">{stats.avgRaiseDiff >= 0 ? '+' : ''}{formatMoney(stats.avgRaiseDiff)}</span>
              <span className="insight-label">Sizing vs. rational baseline</span>
            </div>
          )}
          {stats.foldGap !== 0 && (
            <div className="insight-card insight-card--clinical">
              <span className="insight-value insight-value--clinical">{stats.foldGap > 0 ? '+' : ''}{stats.foldGap}%</span>
              <span className="insight-label">Withdrawal (fold) tendency vs. baseline</span>
            </div>
          )}
        </div>
      </section>

      {/* Psychological profile — detailed psychiatry-style evaluation with diagrams */}
      {(() => {
        const radarDimensions = [
          { label: 'Activation', value: stats.aggression ?? 50 },
          { label: 'Consistency', value: stats.adherence ?? 50 },
          { label: 'Risk-taking', value: stats.total > 0 ? Math.min(100, ((stats.byAction.raise || 0) / stats.total) * 150) : 50 },
          { label: 'Withdrawal', value: stats.total > 0 ? ((stats.byAction.fold || 0) / stats.total) * 100 : 50 },
          { label: 'Certainty', value: stats.avgEquity != null ? Math.min(100, stats.avgEquity) : 50 },
        ]
        return (
          <Card className="profile-card-clinical" sx={{ mb: 3 }}>
            <CardContent sx={{ p: 0 }}>
              {/* Report header */}
              <Box className="psych-report-header" sx={{ px: 3, pt: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box component="span" className="clinical-badge" sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: 'primary.dark', color: 'primary.contrastText', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                      PSYCHOLOGICAL PROFILE
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>For self-reflection only · Not a medical diagnosis</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace' }}>
                    Ref. ASSESS-{new Date().toISOString().slice(0, 10).replace(/-/g, '')}
                  </Typography>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 600, mt: 1.5, color: 'primary.main' }}>Behavioral &amp; cognitive evaluation</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Decision patterns under uncertainty · Entertainment × healthcare</Typography>
              </Box>

              <Box sx={{ p: 3 }}>
                {/* Section 1: Overview + radar */}
                <Typography variant="subtitle2" className="psych-section-num" sx={{ color: 'primary.main', fontWeight: 700, mb: 1.5 }}>1. Dimensional overview</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, gap: 3, alignItems: 'start', mb: 3 }}>
                  <Paper variant="outlined" className="psych-diagram-wrap" sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.6)', borderColor: 'rgba(13,148,136,0.3)' }}>
                    <PsychRadarChart dimensions={radarDimensions} />
                  </Paper>
                  <Box>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1.5 }} className="profile-metrics-row">
                      {[
                        { value: stats.total, label: 'Total decisions' },
                        { value: `${stats.adherence}%`, label: 'Consistency index' },
                        { value: stats.avgEquity != null ? `${stats.avgEquity.toFixed(1)}%` : '—', label: 'Avg. perceived certainty' },
                        { value: `${stats.aggression}/100`, label: 'Behavioral activation' },
                      ].map((s) => (
                        <Paper key={s.label} className="profile-metric-pill" sx={{ p: 1.5, textAlign: 'center', minWidth: 90 }}>
                          <Typography sx={{ fontSize: '1.15rem', fontWeight: 700 }} className="profile-metric-value">{s.value}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{s.label}</Typography>
                        </Paper>
                      ))}
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary', lineHeight: 1.6 }}>
                      The radar summarizes five dimensions derived from your decisions: <strong>Activation</strong> (tendency to act vs. hold back), <strong>Consistency</strong> (alignment with a rational baseline), <strong>Risk-taking</strong> (frequency of high-commitment moves), <strong>Withdrawal</strong> (frequency of folding), and <strong>Certainty</strong> (average perceived strength). These are indicative patterns for self-reflection only.
                    </Typography>
                  </Box>
                </Box>

                {/* Section 2: Clinical scales */}
                <Typography variant="subtitle2" className="psych-section-num" sx={{ color: 'primary.main', fontWeight: 700, mb: 1.5 }}>2. Key scales</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.4)', borderColor: 'rgba(13,148,136,0.25)' }}>
                    <ClinicalScale label="Behavioral activation" value={stats.aggression} lowLabel="Passive" highLabel="Active" />
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.4)', borderColor: 'rgba(13,148,136,0.25)' }}>
                    <ClinicalScale label="Decision consistency" value={stats.adherence} lowLabel="Variable" highLabel="Stable" />
                  </Paper>
                </Box>

                {/* Section 3: Response distribution + quality by stage */}
                <Typography variant="subtitle2" className="psych-section-num" sx={{ color: 'primary.main', fontWeight: 700, mb: 1.5 }}>3. Response patterns &amp; quality by stage</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 220px' }, gap: 2, mb: 3 }}>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.4)', borderColor: 'rgba(13,148,136,0.25)' }}>
                    <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary', fontWeight: 600 }}>Response tendency distribution</Typography>
                    <div className="profile-tendencies">
                      {['call', 'raise', 'fold'].map((act) => (
                        <div key={act} className="tendency-bar">
                          <span className="tendency-label">{act}</span>
                          <div className="tendency-track">
                            <div className={`tendency-fill tendency-${act}`} style={{ width: `${((stats.byAction[act] || 0) / stats.total) * 100}%` }} />
                          </div>
                          <span className="tendency-val">{stats.byAction[act] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.4)', borderColor: 'rgba(13,148,136,0.25)' }}>
                    <QualityByStageChart byStreet={stats.byStreet} streetCorrect={stats.streetCorrect} />
                  </Paper>
                </Box>

                {/* Section 4: Risk & emotional regulation */}
                <Typography variant="subtitle2" className="psych-section-num" sx={{ color: 'primary.main', fontWeight: 700, mb: 1.5 }}>4. Risk-taking under uncertainty &amp; emotional regulation</Typography>
                <Box className="clinical-note-block" sx={{ p: 2, mb: 3 }}>
                  <Stack spacing={1.5} sx={{ fontSize: '0.9rem' }}>
                    <Typography variant="body2"><strong>Behavioral activation:</strong> {stats.aggression}/100 — reflects tendency to act versus hold back under pressure. Higher scores suggest more initiative in uncertain situations.</Typography>
                    <Typography variant="body2"><strong>Risk-taking threshold:</strong> Decisions are flagged when commitment exceeds the rational baseline by &gt;{Math.round(BLUFF_OVER_RAISE_PERCENT * 100)}%. This can indicate moments where emotional or impulsive factors may outweigh calculated risk.</Typography>
                    {stats.bluffCount > 0 ? (
                      <>
                        <Typography variant="body2"><strong>High-risk commitments this session:</strong> {stats.bluffCount} {(stats.byAction.raise || 0) > 0 ? `(${stats.bluffRate}% of commitment decisions)` : '—'}. These are points where your commitment size was notably above the baseline for your perceived certainty.</Typography>
                        {stats.avgEquityWhenBluffing != null && (
                          <Typography variant="body2"><strong>Average perceived certainty in those moments:</strong> {stats.avgEquityWhenBluffing.toFixed(1)}% — lower certainty with high commitment may reflect risk-seeking or stress-induced shifts.</Typography>
                        )}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                          <Typography variant="body2" component="span"><strong>By stage:</strong></Typography>
                          {['preflop', 'flop', 'turn', 'river'].filter((st) => (stats.bluffByStreet[st] || 0) > 0).map((st) => (
                            <Chip key={st} label={`${st} ${stats.bluffByStreet[st]}`} size="small" className="clinical-chip-risk" sx={{ height: 22, fontSize: '0.75rem' }} />
                          ))}
                        </Box>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">No high-risk commitments above threshold this session. Commitment sizes remained within or below the rational baseline.</Typography>
                    )}
                  </Stack>
                </Box>

                {/* Section 5: Interpretive note + CTA */}
                <Typography variant="subtitle2" className="psych-section-num" sx={{ color: 'primary.main', fontWeight: 700, mb: 1.5 }}>5. Summary &amp; full report</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7, mb: 2 }}>
                  This profile is generated from decision data under uncertainty and is intended to support self-awareness at the intersection of entertainment and mental health. It is not a clinical or medical evaluation. For a detailed breakdown of cognitive tendencies, stress response, and transferable insights to daily life, open the full psychological assessment report below.
                </Typography>
                <Button
                  variant="contained"
                  size="medium"
                  onClick={handleOpenDecisionReport}
                  className="btn-clinical-report"
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  View full psychological assessment report
                </Button>
              </Box>
            </CardContent>
          </Card>
        )
      })()}

      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="md" fullWidth scroll="paper" className="dialog-clinical">
        <DialogTitle sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: '0.7rem', fontWeight: 700 }}>REPORT</Box>
            Psychological Assessment — Decision Patterns &amp; Transferable Insights
          </Box>
        </DialogTitle>
        <DialogContent>
          {reportLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {reportError && (
            <Typography color="error" sx={{ py: 2 }}>{reportError}</Typography>
          )}
          {!reportLoading && !reportError && reportData && (
            <DecisionTransferReportView report={reportData} />
          )}
        </DialogContent>
      </Dialog>

      {/* Optimal vs Actual */}
      <Card sx={{ mb: 3 }} className="card-clinical">
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Your responses vs. rational baseline</Typography>
          <div className="comparison-chart">
            {['call', 'raise', 'fold', 'check'].map((action) => (
              <div key={action} className="comparison-row">
                <span className="comparison-label">{action}</span>
                <div className="comparison-bars">
                  <div className="comparison-bar-wrap">
                    <span className="comparison-bar-label">You</span>
                    <div className="comparison-bar-track">
                      <div className={`comparison-bar-fill you ${action}`} style={{ width: `${((stats.byAction[action] || 0) / maxAction) * 100}%` }} />
                    </div>
                    <span className="comparison-bar-val">{stats.byAction[action] || 0}</span>
                  </div>
                  <div className="comparison-bar-wrap">
                    <span className="comparison-bar-label">Optimal</span>
                    <div className="comparison-bar-track">
                      <div className={`comparison-bar-fill optimal ${action}`} style={{ width: `${((action === 'check' ? (stats.byOptimal.check || 0) + (stats.byOptimal.no_bet || 0) : (stats.byOptimal[action] || 0)) / maxAction) * 100}%` }} />
                    </div>
                    <span className="comparison-bar-val">{action === 'check' ? (stats.byOptimal.check || 0) + (stats.byOptimal.no_bet || 0) : stats.byOptimal[action] || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Equity Heatmap */}
      <Card sx={{ mb: 3 }} className="card-clinical">
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Certainty over time</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>Each cell = one decision. Darker green = higher perceived certainty.</Typography>
          <div className="equity-heatmap">
            {moves.map((m, i) => (
              <div key={i} className="heatmap-cell-wrap" onMouseEnter={() => setHoveredMove(i)} onMouseLeave={() => setHoveredMove(null)}>
                <EquityCell value={m.equity} />
              </div>
            ))}
          </div>
          {hoveredMove != null && moves[hoveredMove] && (
            <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
              Move #{hoveredMove + 1}: {moves[hoveredMove].action} on {moves[hoveredMove].street} — Equity: {moves[hoveredMove].equity != null ? `${Number(moves[hoveredMove].equity).toFixed(1)}%` : '—'}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Clinical summary callout */}
      <section className="move-log-section summary-callout summary-callout--clinical">
        <div className="summary-callout-inner">
          <span className="summary-callout-label">Assessment summary</span>
          <p className="summary-callout-text">
            {stats.total} decisions · {stats.matched} consistent with rational baseline ({stats.adherence}%) · Average perceived certainty {stats.avgEquity != null ? `${stats.avgEquity.toFixed(1)}%` : '—'}.
            This profile is for self-awareness at the intersection of entertainment and mental health; it is not a clinical or medical evaluation.
          </p>
        </div>
      </section>

      {/* Street Performance */}
      <Card sx={{ mb: 3 }} className="card-clinical">
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Decision consistency by stage</Typography>
          <div className="street-heatmap">
            {['preflop', 'flop', 'turn', 'river'].map((street) => {
              const total = stats.byStreet[street] || 0
              const correct = stats.streetCorrect[street] || 0
              const pct = total > 0 ? (correct / total) * 100 : 0
              return (
                <div key={street} className="street-cell">
                  <span className="street-name">{street}</span>
                  <div className="street-bar-wrap">
                    <div className="street-bar-fill" style={{ width: `${pct}%`, backgroundColor: pct >= 70 ? '#2ecc71' : pct >= 50 ? '#f1c40f' : '#e74c3c' }} />
                  </div>
                  <span className="street-stat">{correct}/{total}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Raise Amount Comparison */}
      {stats.raiseComparisons.length > 0 && (
        <Card sx={{ mb: 3 }} className="card-clinical">
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Commitment size vs. rational baseline</Typography>
            <div className="raise-comparison-chart">
              {stats.raiseComparisons.map((r, i) => {
                const max = Math.max(r.actual, r.optimal, 0.1)
                return (
                  <div key={i} className="raise-row">
                    <div className="raise-bar-wrap">
                      <div className="raise-bar actual" style={{ width: `${(r.actual / max) * 100}%` }} />
                      <span className="raise-label">You: {formatMoney(r.actual)}</span>
                    </div>
                    <div className="raise-bar-wrap">
                      <div className="raise-bar optimal" style={{ width: `${(r.optimal / max) * 100}%` }} />
                      <span className="raise-label">Opt: {formatMoney(r.optimal)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equity Trend (EV graph with y-axis labels) */}
      {stats.equityValues.length > 0 && (
        <Card sx={{ mb: 3 }} className="card-clinical">
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Perceived certainty trend</Typography>
            <div className="equity-trend">
              <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', py: 0.5, minWidth: 28 }}>
                  {[100, 75, 50, 25, 0].map((n) => (
                    <Typography key={n} variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{n}%</Typography>
                  ))}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <svg viewBox="0 0 400 80" className="trend-svg" preserveAspectRatio="none">
                    <polyline
                      fill="none"
                      stroke="url(#equityGrad)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={stats.equityValues.map((v, i) => {
                        const denom = Math.max(stats.equityValues.length - 1, 1)
                        return `${(i / denom) * 400},${70 - (v / 100) * 60}`
                      }).join(' ')}
                    />
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#e74c3c" />
                        <stop offset="50%" stopColor="#f1c40f" />
                        <stop offset="100%" stopColor="#2ecc71" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">First move</Typography>
                    <Typography variant="caption" color="text.secondary">Last move</Typography>
                  </Box>
                </Box>
              </Box>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Move List */}
      <Card className="card-clinical">
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>Decision history</Typography>
          <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
            High-risk commitment flagged when commitment exceeds rational baseline by &gt;{Math.round(BLUFF_OVER_RAISE_PERCENT * 100)}%.
          </Typography>
          <Stack spacing={1}>
            {moves.map((m, i) => {
              const opt = (m.optimalMove || 'no_bet').toLowerCase()
              const act = (m.action || '').toLowerCase()
              const matched = act === opt || (act === 'check' && opt === 'no_bet')
              const isExpanded = expandedMove === i
              const bluff = isBluffRaise(m)

              return (
                <Paper
                  key={i}
                  sx={{
                    p: 1.5,
                    cursor: 'pointer',
                    bgcolor: '#1e1e1e',
                    borderLeft: `3px solid ${matched ? '#2ecc71' : '#e74c3c'}`,
                    '&:hover': { bgcolor: '#333' },
                  }}
                  onClick={() => setExpandedMove(isExpanded ? null : i)}
                  onMouseEnter={() => setHoveredMove(i)}
                  onMouseLeave={() => setHoveredMove(null)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Hand #{m.handNumber ?? '—'}</Typography>
                    <Chip label={m.street} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                    <Chip
                      label={matched ? 'Consistent' : 'Variant'}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: matched ? 'rgba(46,204,113,0.2)' : 'rgba(231,76,60,0.2)',
                        color: matched ? '#2ecc71' : '#e74c3c',
                      }}
                    />
                    <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5, alignItems: 'center', fontSize: '0.85rem' }}>
                      <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{m.action}</Typography>
                      {m.amount > 0 && <Typography component="span" sx={{ color: '#f1c40f', fontSize: '0.85rem' }}>{formatMoney(m.amount)}</Typography>}
                      {bluff && (
                        <Typography component="span" sx={{ color: 'warning.main', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>HIGH-RISK</Typography>
                      )}
                      <Typography component="span" sx={{ color: '#a0a0c0', fontSize: '0.85rem' }}>
                        Eq: {m.equity != null ? `${Number(m.equity).toFixed(1)}%` : '—'}
                      </Typography>
                    </Box>
                  </Box>
                  <Collapse in={isExpanded}>
                    <Stack spacing={0.5} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', fontSize: '0.85rem' }}>
                      <Typography variant="body2">Your action: <strong>{m.action}</strong> {m.amount > 0 && formatMoney(m.amount)}{bluff && <Box component="span" sx={{ color: 'warning.main', fontWeight: 700, ml: 0.5 }}> HIGH-RISK</Box>}</Typography>
                      <Typography variant="body2">Optimal: <strong>{m.optimalMove}</strong>{m.suggestedRaise != null && m.action === 'raise' && ` (suggested: ${formatMoney(m.suggestedRaise)})`}</Typography>
                      <Typography variant="body2">Equity at decision: {m.equity != null ? `${Number(m.equity).toFixed(1)}%` : '—'}</Typography>
                    </Stack>
                  </Collapse>
                </Paper>
              )
            })}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}

/** Build a behavioral/decision-making profile from move log for the bots tab */
export function getPlayerProfile(moves) {
  if (!moves?.length) return null
  const stats = computeStats(moves)
  return {
    aggression: stats.aggression,
    adherence: stats.adherence,
    byAction: stats.byAction,
    bluffCount: stats.bluffCount,
    bluffRate: stats.bluffRate,
    bluffByStreet: stats.bluffByStreet,
    avgEquityWhenBluffing: stats.avgEquityWhenBluffing,
    bluffConditionPercent: Math.round(BLUFF_OVER_RAISE_PERCENT * 100),
    totalMoves: stats.total,
  }
}
