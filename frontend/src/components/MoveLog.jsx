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

function DecisionTransferReportView({ report }) {
  const tendencies = report?.decision_tendencies_summary ?? []
  const habits = report?.habit_insights ?? []
  const domains = report?.cross_domain_transfer ?? []
  const stress = report?.cognitive_load_stress_profile
  const summary = report?.summary_card

  return (
    <Stack spacing={3} sx={{ py: 1, pb: 3 }}>
      {summary && (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
          <Typography variant="h6" gutterBottom>Summary</Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>{summary.confidence_levels}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" color="primary">Top traits</Typography>
              {(summary.top_3_dominant_traits || []).map(([name, desc], i) => (
                <Typography key={i} variant="body2" sx={{ mt: 0.5 }}><strong>{name}</strong>: {desc}</Typography>
              ))}
            </Box>
            <Box>
              <Typography variant="subtitle2" color="error">Risk patterns</Typography>
              {(summary.top_3_decision_risk_patterns || []).map(([name, desc], i) => (
                <Typography key={i} variant="body2" sx={{ mt: 0.5 }}><strong>{name}</strong>: {desc}</Typography>
              ))}
            </Box>
            <Box>
              <Typography variant="subtitle2" color="success.main">Transferable habits</Typography>
              {(summary.top_3_transferable_habits || []).map(([name, desc], i) => (
                <Typography key={i} variant="body2" sx={{ mt: 0.5 }}><strong>{name}</strong>: {desc}</Typography>
              ))}
            </Box>
          </Box>
        </Paper>
      )}

      {tendencies.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>Decision tendencies</Typography>
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
          <Typography variant="h6" gutterBottom>Habit insights</Typography>
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
          <Typography variant="h6" gutterBottom>Cross-domain transfer</Typography>
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
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Cognitive load &amp; stress</Typography>
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
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Move Log</Typography>
        <Typography variant="body2">No moves logged yet. Play hands to see your moves, equity, optimal plays, and visual analytics here.</Typography>
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
    <Box className="move-log" sx={{ maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Move Log</Typography>
        <Typography variant="body2">Your plays with equity, optimal comparison &amp; analytics</Typography>
      </Box>

      {/* Live Insights */}
      <section className="move-log-section insights-section">
        <h2 className="section-title">Live Insights</h2>
        <div className="insights-grid">
          <div className="insight-card">
            <span className="insight-value">{stats.adherence}%</span>
            <span className="insight-label">Rational adherence — deviations inform opponent calibration</span>
          </div>
          <div className="insight-card">
            <span className="insight-value">{stats.aggression}</span>
            <span className="insight-label">Behavioral activation index (0–100) — opponents tuned to this</span>
          </div>
          {stats.riverPct != null && (
            <div className="insight-card">
              <span className="insight-value">{stats.riverPct}%</span>
              <span className="insight-label">River accuracy — decision quality under pressure</span>
            </div>
          )}
          {stats.avgRaiseDiff != null && (
            <div className="insight-card">
              <span className="insight-value">{stats.avgRaiseDiff >= 0 ? '+' : ''}{formatMoney(stats.avgRaiseDiff)}</span>
              <span className="insight-label">Avg raise vs optimal — sizing pattern</span>
            </div>
          )}
          {stats.foldGap !== 0 && (
            <div className="insight-card">
              <span className="insight-value">{stats.foldGap > 0 ? '+' : ''}{stats.foldGap}%</span>
              <span className="insight-label">Fold rate vs optimal — pattern opponents may target</span>
            </div>
          )}
        </div>
      </section>

      {/* Behavioral / decision-making profile */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Decision-making profile</Typography>
          <div className="profile-card">
            <div className="profile-avatar">
              <span className="profile-avatar-emoji">&#x1F0CF;</span>
              <div className="profile-adherence-ring" style={{ '--adherence': stats.adherence }}>
                <div className="profile-adherence-inner" />
              </div>
            </div>
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'center', my: 2 }}>
              {[
                { value: stats.total, label: 'Moves' },
                { value: `${stats.adherence}%`, label: 'Optimal' },
                { value: stats.avgEquity != null ? `${stats.avgEquity.toFixed(1)}%` : '—', label: 'Avg Equity' },
                { value: stats.aggression, label: 'Activation' },
              ].map((s) => (
                <Paper key={s.label} sx={{ p: 1.5, textAlign: 'center', bgcolor: '#1e1e1e', minWidth: 80 }}>
                  <Typography sx={{ fontSize: '1.3rem', fontWeight: 700, color: '#eee' }}>{s.value}</Typography>
                  <Typography variant="caption">{s.label}</Typography>
                </Paper>
              ))}
            </Stack>
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

            {/* Behavioral patterns & risk-taking under low equity */}
            <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.secondary' }}>Behavioral patterns &amp; risk-taking under low equity</Typography>
              <Stack spacing={1} sx={{ fontSize: '0.85rem' }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                  <Typography variant="body2"><strong>Behavioral activation:</strong> {stats.aggression}/100 — opponents are tuned to the inverse.</Typography>
                </Box>
                <Box>
                  <Typography variant="body2"><strong>Risk-taking criterion:</strong> Raise &gt;{Math.round(BLUFF_OVER_RAISE_PERCENT * 100)}% over suggested amount for your equity.</Typography>
                </Box>
                {stats.bluffCount > 0 ? (
                  <>
                    <Typography variant="body2"><strong>Low-equity aggression this session:</strong> {stats.bluffCount} {(stats.byAction.raise || 0) > 0 ? `${stats.bluffRate}% of your raises` : '—'}</Typography>
                    {stats.avgEquityWhenBluffing != null && (
                      <Typography variant="body2"><strong>Avg equity in those decisions:</strong> {stats.avgEquityWhenBluffing.toFixed(1)}%</Typography>
                    )}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                      <Typography variant="body2" component="span"><strong>By street:</strong></Typography>
                      {['preflop', 'flop', 'turn', 'river'].filter((st) => (stats.bluffByStreet[st] || 0) > 0).map((st) => (
                        <Chip key={st} label={`${st} ${stats.bluffByStreet[st]}`} size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'rgba(231,76,60,0.2)', color: '#e74c3c' }} />
                      ))}
                      {['preflop', 'flop', 'turn', 'river'].every((st) => !(stats.bluffByStreet[st] || 0)) && (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )}
                    </Box>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">No low-equity aggression detected this session (raises within suggested range).</Typography>
                )}
              </Stack>
            </Box>

            <Button
              variant="outlined"
              size="medium"
              onClick={handleOpenDecisionReport}
              sx={{ mt: 2, alignSelf: 'flex-start' }}
            >
              View decision insights
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle>Decision Transfer Report</DialogTitle>
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
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Your Moves vs Optimal</Typography>
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
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Equity Heatmap</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>Each cell = one move. Darker green = higher equity.</Typography>
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

      {/* Summary callout */}
      <section className="move-log-section summary-callout">
        <div className="summary-callout-inner">
          <span className="summary-callout-label">Session summary</span>
          <p className="summary-callout-text">
            {stats.total} decisions · {stats.matched} optimal ({stats.adherence}%) · Avg equity {stats.avgEquity != null ? `${stats.avgEquity.toFixed(1)}%` : '—'}.
            Bots use this decision-making profile to calibrate to your behavioral patterns.
          </p>
        </div>
      </section>

      {/* Street Performance */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Performance by Street</Typography>
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
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Raise Amount: You vs Optimal</Typography>
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
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Equity Trend</Typography>
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
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>All Moves</Typography>
          <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
            Raise flagged as <Box component="span" sx={{ color: '#e74c3c', fontWeight: 700 }}>BLUFF</Box> when your raise is more than {Math.round(BLUFF_OVER_RAISE_PERCENT * 100)}% over the suggested amount for your equity.
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
                      label={matched ? '✓ Optimal' : '≠ Deviated'}
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
                        <Typography component="span" sx={{ color: '#e74c3c', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.05em' }}>BLUFF</Typography>
                      )}
                      <Typography component="span" sx={{ color: '#a0a0c0', fontSize: '0.85rem' }}>
                        Eq: {m.equity != null ? `${Number(m.equity).toFixed(1)}%` : '—'}
                      </Typography>
                    </Box>
                  </Box>
                  <Collapse in={isExpanded}>
                    <Stack spacing={0.5} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', fontSize: '0.85rem' }}>
                      <Typography variant="body2">Your action: <strong>{m.action}</strong> {m.amount > 0 && formatMoney(m.amount)}{bluff && <Box component="span" sx={{ color: '#e74c3c', fontWeight: 700, ml: 0.5 }}> BLUFF</Box>}</Typography>
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
