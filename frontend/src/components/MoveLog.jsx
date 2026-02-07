import { useState, useMemo, useCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
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
    raiseCount, total, matched, adherence, avgEquity,
    byAction, byOptimal, byStreet, streetCorrect, equityValues,
    raiseComparisons, aggression, optimalStreak, deviateStreak,
    foldGap, riverPct, avgRaiseDiff,
    bluffCount, bluffByStreet, avgEquityWhenBluffing, bluffRate,
  }
}

/* ── Tiny equity cell for the heatmap ── */
function EquityCell({ value }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0
  const intensity = pct / 100
  const r = Math.round(46 + (1 - intensity) * 200)
  const g = Math.round(204 + intensity * 51)
  const b = 46
  return (
    <div
      className="ml-heatmap__cell"
      style={{ backgroundColor: `rgb(${r},${g},${b})` }}
      title={`Equity: ${value != null ? value.toFixed(1) : '?'}%`}
    >
      {value != null ? value.toFixed(0) : '—'}
    </div>
  )
}

/* ── Psych radar chart (from behavioral assessment) ── */
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
    <Box sx={{ position: 'relative', textAlign: 'center' }}>
      <svg viewBox="0 0 240 260" className="psych-radar-svg">
        {gridPoints.map((ring, ri) => (
          <polygon key={ri} points={ring.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(52, 152, 219, 0.15)" strokeWidth="0.8" />
        ))}
        {dimensions.map((_, i) => {
          const end = toPoint(i, 100)
          return <line key={i} x1={cx} y1={cy} x2={end[0]} y2={end[1]} stroke="rgba(52, 152, 219, 0.2)" strokeWidth="0.8" />
        })}
        <polygon points={polygonPoints} fill="rgba(52, 152, 219, 0.2)" stroke="#3498db" strokeWidth="2" />
        {axisLabels.map((a, i) => (
          <text key={i} x={a.x} y={a.y} textAnchor="middle" dominantBaseline="middle" className="psych-radar-label">{a.label}</text>
        ))}
      </svg>
    </Box>
  )
}

/* ── Clinical scale bar ── */
function ClinicalScale({ label, value, max = 100, lowLabel = 'Low', highLabel = 'High' }) {
  const pct = Math.min(100, Math.max(0, (value ?? 0) / max * 100))
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#a0a0c0' }}>{label}</Typography>
        <Typography variant="caption" sx={{ color: '#3498db', fontWeight: 700 }}>{value ?? '—'}</Typography>
      </Box>
      <Box sx={{ height: 8, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: '#3498db', borderRadius: 1, transition: 'width 0.5s ease' }} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#666' }}>{lowLabel}</Typography>
        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#666' }}>{highLabel}</Typography>
      </Box>
    </Box>
  )
}

/* ── Quality by stage sparkline ── */
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
    <Box>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#a0a0c0', fontWeight: 600 }}>Quality by stage</Typography>
      <svg viewBox={`0 0 ${w} ${h}`} className="psych-quality-svg">
        <polyline points={points} fill="none" stroke="#3498db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {stages.map((s, i) => (
          <text key={s} x={pad + (i / (stages.length - 1 || 1)) * (w - 2 * pad)} y={h - 4} textAnchor="middle" className="psych-quality-label">{s}</text>
        ))}
      </svg>
    </Box>
  )
}

/* ── Decision Transfer Report Dialog ── */
function DecisionTransferReportView({ report }) {
  const tendencies = report?.decision_tendencies_summary ?? []
  const habits = report?.habit_insights ?? []
  const domains = report?.cross_domain_transfer ?? []
  const stress = report?.cognitive_load_stress_profile
  const summary = report?.summary_card

  return (
    <Stack spacing={3} sx={{ py: 1, pb: 3 }}>
      {summary && (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(52,152,219,0.3)' }}>
          <Typography variant="subtitle2" sx={{ color: '#3498db', fontWeight: 700, mb: 1 }}>SUMMARY</Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>{summary.confidence_levels}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" color="primary">Dominant traits</Typography>
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
              <Typography variant="subtitle2" sx={{ color: '#2ecc71' }}>Transferable habits</Typography>
              {(summary.top_3_transferable_habits || []).map(([name, desc], i) => (
                <Typography key={i} variant="body2" sx={{ mt: 0.5 }}><strong>{name}</strong>: {desc}</Typography>
              ))}
            </Box>
          </Box>
        </Paper>
      )}

      {tendencies.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom sx={{ color: '#3498db' }}>Cognitive tendencies</Typography>
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
          <Typography variant="h6" gutterBottom sx={{ color: '#3498db' }}>Protective &amp; corrective patterns</Typography>
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
          <Typography variant="h6" gutterBottom sx={{ color: '#3498db' }}>Cross-domain transfer</Typography>
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
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'rgba(52,152,219,0.3)' }}>
          <Typography variant="h6" gutterBottom sx={{ color: '#3498db' }}>Stress response &amp; cognitive load</Typography>
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

/* ── Collapsible section wrapper ── */
function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="ml-card">
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div className="ml-card__title" style={{ marginBottom: 0 }}>{title}</div>
        <IconButton size="small" sx={{ color: '#888' }}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ mt: 1.5 }}>{children}</Box>
      </Collapse>
    </div>
  )
}

/* ================================================================
   Main export
   ================================================================ */
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

  /* ── Empty state ── */
  if (moves.length === 0) {
    return (
      <Box className="move-log" sx={{ textAlign: 'center', pt: 8 }}>
        <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>&#x1F0CF;</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Behavioral &amp; Cognitive Assessment</Typography>
        <Typography variant="body2" color="text.secondary">
          No assessment data yet. Play hands to generate your psychological profile and decision analytics.
        </Typography>
      </Box>
    )
  }

  const maxAction = Math.max(...Object.values(stats.byAction).filter(Boolean), ...Object.values(stats.byOptimal).filter(Boolean), 1)

  const radarDimensions = [
    { label: 'Activation', value: stats.aggression ?? 50 },
    { label: 'Consistency', value: stats.adherence ?? 50 },
    { label: 'Risk-taking', value: stats.total > 0 ? Math.min(100, ((stats.byAction.raise || 0) / stats.total) * 150) : 50 },
    { label: 'Withdrawal', value: stats.total > 0 ? ((stats.byAction.fold || 0) / stats.total) * 100 : 50 },
    { label: 'Certainty', value: stats.avgEquity != null ? Math.min(100, stats.avgEquity) : 50 },
  ]

  /* ============================================================ */
  return (
    <Box className="move-log">
      {/* ── Header ── */}
      <div className="ml-header">
        <h1>Move Log</h1>
        <p>{stats.total} decisions tracked &middot; {stats.matched} optimal plays</p>
      </div>

      {/* ── KPI Ribbon ── */}
      <div className="ml-kpi-ribbon">
        <div className="ml-kpi ml-kpi--green">
          <span className="ml-kpi__value">{stats.adherence}%</span>
          <span className="ml-kpi__label">Optimal Play Rate</span>
        </div>
        <div className="ml-kpi ml-kpi--blue">
          <span className="ml-kpi__value">{stats.aggression}</span>
          <span className="ml-kpi__label">Aggression Index</span>
        </div>
        <div className="ml-kpi ml-kpi--gold">
          <span className="ml-kpi__value">{stats.avgEquity != null ? `${stats.avgEquity.toFixed(0)}%` : '—'}</span>
          <span className="ml-kpi__label">Avg Equity</span>
        </div>
        {stats.riverPct != null && (
          <div className="ml-kpi ml-kpi--blue">
            <span className="ml-kpi__value">{stats.riverPct}%</span>
            <span className="ml-kpi__label">River Accuracy</span>
          </div>
        )}
        {stats.avgRaiseDiff != null && (
          <div className="ml-kpi ml-kpi--gold">
            <span className="ml-kpi__value">{stats.avgRaiseDiff >= 0 ? '+' : ''}{formatMoney(stats.avgRaiseDiff)}</span>
            <span className="ml-kpi__label">Raise vs Optimal</span>
          </div>
        )}
        {stats.foldGap !== 0 && (
          <div className="ml-kpi ml-kpi--red">
            <span className="ml-kpi__value">{stats.foldGap > 0 ? '+' : ''}{stats.foldGap}%</span>
            <span className="ml-kpi__label">Fold Gap</span>
          </div>
        )}
      </div>

      {/* ── Player Profile + Behavioral Radar side-by-side ── */}
      <div className="ml-grid-2">
        {/* Profile card */}
        <Section title="Player Profile">
          <div className="ml-profile-row">
            <div className="ml-avatar">
              <span className="ml-avatar__emoji">&#x1F0CF;</span>
              <div className="ml-avatar__ring" style={{ '--adherence': stats.adherence }}>
                <div className="ml-avatar__ring-inner" />
              </div>
            </div>
            <div className="ml-profile-stats">
              {[
                { value: stats.total, label: 'Moves' },
                { value: `${stats.adherence}%`, label: 'Optimal' },
                { value: stats.avgEquity != null ? `${stats.avgEquity.toFixed(0)}%` : '—', label: 'Equity' },
                { value: stats.aggression, label: 'Aggress.' },
              ].map((s) => (
                <div key={s.label} className="ml-profile-stat">
                  <span className="ml-profile-stat__value">{s.value}</span>
                  <span className="ml-profile-stat__label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tendency bars */}
          {['call', 'raise', 'fold'].map((act) => (
            <div key={act} className="ml-tendency">
              <span className="ml-tendency__label">{act}</span>
              <div className="ml-tendency__track">
                <div
                  className={`ml-tendency__fill ml-tendency__fill--${act}`}
                  style={{ width: `${((stats.byAction[act] || 0) / stats.total) * 100}%` }}
                />
              </div>
              <span className="ml-tendency__val">{stats.byAction[act] || 0}</span>
            </div>
          ))}

          <Button
            variant="outlined"
            size="small"
            onClick={handleOpenDecisionReport}
            sx={{ mt: 2, fontSize: '0.75rem', textTransform: 'none', borderColor: 'rgba(52,152,219,0.4)', color: '#3498db' }}
          >
            Full Psychological Assessment
          </Button>
        </Section>

        {/* Behavioral Radar + Scales */}
        <Section title="Behavioral Dimensions">
          <PsychRadarChart dimensions={radarDimensions} />
          <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <ClinicalScale label="Behavioral activation" value={stats.aggression} lowLabel="Passive" highLabel="Active" />
            <ClinicalScale label="Decision consistency" value={stats.adherence} lowLabel="Variable" highLabel="Stable" />
          </Box>
        </Section>
      </div>

      {/* ── Bluff Analysis + Quality by Stage ── */}
      <div className="ml-grid-2">
        <Section title="Bluff Analysis">
          <Stack spacing={1.2} sx={{ fontSize: '0.82rem' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Bluff threshold</Typography>
              <Chip label={`>${Math.round(BLUFF_OVER_RAISE_PERCENT * 100)}% over suggested`} size="small" sx={{ height: 20, fontSize: '0.68rem', bgcolor: 'rgba(231,76,60,0.15)', color: '#e74c3c' }} />
            </Box>
            {stats.bluffCount > 0 ? (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Bluffs this session</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#e74c3c' }}>
                    {stats.bluffCount} <Typography component="span" variant="caption" color="text.secondary">({stats.bluffRate}% of raises)</Typography>
                  </Typography>
                </Box>
                {stats.avgEquityWhenBluffing != null && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Avg equity when bluffing</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{stats.avgEquityWhenBluffing.toFixed(1)}%</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="body2" sx={{ mb: 0.5, color: 'text.secondary' }}>Bluffs by street</Typography>
                  <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                    {['preflop', 'flop', 'turn', 'river'].filter((st) => (stats.bluffByStreet[st] || 0) > 0).map((st) => (
                      <Chip key={st} label={`${st} ${stats.bluffByStreet[st]}`} size="small" sx={{ height: 22, fontSize: '0.68rem', bgcolor: 'rgba(231,76,60,0.15)', color: '#e74c3c', textTransform: 'capitalize' }} />
                    ))}
                  </Box>
                </Box>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                No bluffs detected yet — all raises within suggested range.
              </Typography>
            )}
            <Box sx={{ pt: 0.5, borderTop: '1px solid rgba(255,255,255,0.06)', mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Bots use your aggression index ({stats.aggression}) inversely to exploit your tendencies.
              </Typography>
            </Box>
          </Stack>
        </Section>

        <Section title="Quality by Stage">
          <QualityByStageChart byStreet={stats.byStreet} streetCorrect={stats.streetCorrect} />
          <Box sx={{ mt: 1.5 }}>
            {['preflop', 'flop', 'turn', 'river'].map((street) => {
              const total = stats.byStreet[street] || 0
              const correct = stats.streetCorrect[street] || 0
              const pct = total > 0 ? (correct / total) * 100 : 0
              return (
                <div key={street} className="ml-street-row">
                  <span className="ml-street-name">{street}</span>
                  <div className="ml-street-track">
                    <div className="ml-street-fill" style={{ width: `${pct}%`, backgroundColor: pct >= 70 ? '#2ecc71' : pct >= 50 ? '#f1c40f' : '#e74c3c' }} />
                  </div>
                  <span className="ml-street-stat">{correct}/{total}</span>
                </div>
              )
            })}
          </Box>
        </Section>
      </div>

      {/* ── Your Moves vs Optimal + Equity Heatmap ── */}
      <div className="ml-grid-2">
        <Section title="You vs Optimal">
          {['call', 'raise', 'fold', 'check'].map((action) => (
            <div key={action} className="ml-cmp-row">
              <span className="ml-cmp-label">{action}</span>
              <div className="ml-cmp-bars">
                <div className="ml-cmp-bar">
                  <span className="ml-cmp-bar__tag">You</span>
                  <div className="ml-cmp-bar__track">
                    <div className={`ml-cmp-bar__fill ml-cmp-bar__fill--you-${action}`} style={{ width: `${((stats.byAction[action] || 0) / maxAction) * 100}%` }} />
                  </div>
                  <span className="ml-cmp-bar__val">{stats.byAction[action] || 0}</span>
                </div>
                <div className="ml-cmp-bar">
                  <span className="ml-cmp-bar__tag">Opt</span>
                  <div className="ml-cmp-bar__track">
                    <div
                      className={`ml-cmp-bar__fill ml-cmp-bar__fill--opt-${action}`}
                      style={{ width: `${((action === 'check' ? (stats.byOptimal.check || 0) + (stats.byOptimal.no_bet || 0) : (stats.byOptimal[action] || 0)) / maxAction) * 100}%` }}
                    />
                  </div>
                  <span className="ml-cmp-bar__val">{action === 'check' ? (stats.byOptimal.check || 0) + (stats.byOptimal.no_bet || 0) : stats.byOptimal[action] || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </Section>

        <Section title="Equity Heatmap">
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Each cell = one move. Darker green = higher equity.</Typography>
          <div className="ml-heatmap">
            {moves.map((m, i) => (
              <div key={i} onMouseEnter={() => setHoveredMove(i)} onMouseLeave={() => setHoveredMove(null)}>
                <EquityCell value={m.equity} />
              </div>
            ))}
          </div>
          {hoveredMove != null && moves[hoveredMove] && (
            <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#a0a0c0' }}>
              Move #{hoveredMove + 1}: {moves[hoveredMove].action} on {moves[hoveredMove].street} — Equity: {moves[hoveredMove].equity != null ? `${Number(moves[hoveredMove].equity).toFixed(1)}%` : '—'}
            </Typography>
          )}
        </Section>
      </div>

      {/* ── Equity Trend (full width) ── */}
      {stats.equityValues.length > 0 && (
        <Section title="Equity Trend">
          <div className="ml-trend-wrap">
            <div className="ml-trend-axis">
              {[100, 75, 50, 25, 0].map((n) => (
                <span key={n}>{n}%</span>
              ))}
            </div>
            <div className="ml-trend-chart">
              <svg viewBox="0 0 400 80" className="ml-trend-svg" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="url(#eqGrad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={stats.equityValues.map((v, i) => {
                    const denom = Math.max(stats.equityValues.length - 1, 1)
                    return `${(i / denom) * 400},${70 - (v / 100) * 60}`
                  }).join(' ')}
                />
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#e74c3c" />
                    <stop offset="50%" stopColor="#f1c40f" />
                    <stop offset="100%" stopColor="#2ecc71" />
                  </linearGradient>
                </defs>
              </svg>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">First</Typography>
                <Typography variant="caption" color="text.secondary">Latest</Typography>
              </Box>
            </div>
          </div>
        </Section>
      )}

      {/* ── Raise Comparison (full width) ── */}
      {stats.raiseComparisons.length > 0 && (
        <Section title="Raise Sizing: You vs Optimal">
          {stats.raiseComparisons.map((r, i) => {
            const max = Math.max(r.actual, r.optimal, 0.1)
            return (
              <div key={i} className="ml-raise-row">
                <div className="ml-raise-bar-wrap">
                  <div className="ml-raise-bar ml-raise-bar--actual" style={{ width: `${(r.actual / max) * 100}%` }} />
                  <span className="ml-raise-label">You: {formatMoney(r.actual)}</span>
                </div>
                <div className="ml-raise-bar-wrap">
                  <div className="ml-raise-bar ml-raise-bar--optimal" style={{ width: `${(r.optimal / max) * 100}%` }} />
                  <span className="ml-raise-label">Opt: {formatMoney(r.optimal)}</span>
                </div>
              </div>
            )
          })}
        </Section>
      )}

      {/* ── Session Summary Callout ── */}
      <div className="ml-callout">
        <span className="ml-callout__tag">Session Summary</span>
        <p className="ml-callout__text">
          {stats.total} decisions &middot; {stats.matched} optimal ({stats.adherence}%) &middot; Avg equity {stats.avgEquity != null ? `${stats.avgEquity.toFixed(1)}%` : '—'}.
          {' '}Bots in Train mode use your Move Log aggression to play against your weaknesses.
        </p>
      </div>

      {/* ── All Moves (full width) ── */}
      <Section title={`All Moves (${moves.length})`} defaultOpen={moves.length <= 12}>
        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: '#666' }}>
          Raise flagged as <Box component="span" sx={{ color: '#e74c3c', fontWeight: 700 }}>BLUFF</Box> when &gt;{Math.round(BLUFF_OVER_RAISE_PERCENT * 100)}% over the suggested amount.
        </Typography>
        <Stack spacing={0.8}>
          {moves.map((m, i) => {
            const opt = (m.optimalMove || 'no_bet').toLowerCase()
            const act = (m.action || '').toLowerCase()
            const matched = act === opt || (act === 'check' && opt === 'no_bet')
            const isExpanded = expandedMove === i
            const bluff = isBluffRaise(m)

            return (
              <div
                key={i}
                className={`ml-move ${matched ? 'ml-move--match' : 'ml-move--deviate'}`}
                onClick={() => setExpandedMove(isExpanded ? null : i)}
                onMouseEnter={() => setHoveredMove(i)}
                onMouseLeave={() => setHoveredMove(null)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#ccc' }}>#{m.handNumber ?? '—'}</Typography>
                  <Chip label={m.street} size="small" sx={{ height: 18, fontSize: '0.65rem', textTransform: 'capitalize', bgcolor: 'rgba(52,152,219,0.15)', color: '#3498db' }} />
                  <Chip
                    label={matched ? 'Optimal' : 'Deviated'}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.65rem',
                      bgcolor: matched ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
                      color: matched ? '#2ecc71' : '#e74c3c',
                    }}
                  />
                  <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'capitalize', color: '#eee' }}>{m.action}</Typography>
                    {m.amount > 0 && <Typography component="span" sx={{ color: '#f1c40f', fontSize: '0.8rem', fontWeight: 600 }}>{formatMoney(m.amount)}</Typography>}
                    {bluff && <Chip label="BLUFF" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(231,76,60,0.2)', color: '#e74c3c', fontWeight: 700 }} />}
                    <Typography component="span" sx={{ color: '#888', fontSize: '0.78rem' }}>
                      {m.equity != null ? `${Number(m.equity).toFixed(0)}% eq` : ''}
                    </Typography>
                  </Box>
                </Box>
                <Collapse in={isExpanded}>
                  <Stack spacing={0.5} sx={{ mt: 1.2, pt: 1, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.82rem' }}>
                    <Typography variant="body2">Your action: <strong>{m.action}</strong> {m.amount > 0 && formatMoney(m.amount)}{bluff && <Box component="span" sx={{ color: '#e74c3c', fontWeight: 700, ml: 0.5 }}>BLUFF</Box>}</Typography>
                    <Typography variant="body2">Optimal: <strong>{m.optimalMove}</strong>{m.suggestedRaise != null && m.action === 'raise' && ` (suggested: ${formatMoney(m.suggestedRaise)})`}</Typography>
                    <Typography variant="body2">Equity at decision: {m.equity != null ? `${Number(m.equity).toFixed(1)}%` : '—'}</Typography>
                  </Stack>
                </Collapse>
              </div>
            )
          })}
        </Stack>
      </Section>

      {/* ── Decision Report Dialog ── */}
      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="md" fullWidth scroll="paper">
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
    </Box>
  )
}

/** Build a summary profile from move log for the bots tab & coach chatbot */
export function getPlayerProfile(moves) {
  if (!moves?.length) return null
  const stats = computeStats(moves)
  return {
    aggression: stats.aggression,
    adherence: stats.adherence,
    avgEquity: stats.avgEquity,
    byAction: stats.byAction,
    byStreet: stats.byStreet,
    streetCorrect: stats.streetCorrect,
    bluffCount: stats.bluffCount,
    bluffRate: stats.bluffRate,
    bluffByStreet: stats.bluffByStreet,
    avgEquityWhenBluffing: stats.avgEquityWhenBluffing,
    bluffConditionPercent: Math.round(BLUFF_OVER_RAISE_PERCENT * 100),
    totalMoves: stats.total,
    riverPct: stats.riverPct,
    foldGap: stats.foldGap,
    avgRaiseDiff: stats.avgRaiseDiff,
  }
}
