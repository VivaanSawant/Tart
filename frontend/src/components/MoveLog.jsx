import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import './MoveLog.css'

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  return '$' + Number(val).toFixed(2)
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
  })

  const adherence = total > 0 ? Math.round((matched / total) * 100) : 0
  const avgEquity = equityValues.length ? equityValues.reduce((s, e) => s + e, 0) / equityValues.length : null
  const aggression = total > 0 ? Math.round((((byAction.raise || 0) + (byAction.call || 0) * 0.5) / total) * 100) : 0

  return { total, matched, adherence, avgEquity, byAction, byOptimal, byStreet, streetCorrect, equityValues, raiseComparisons, aggression }
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

export default function MoveLog({ moves = [] }) {
  const [hoveredMove, setHoveredMove] = useState(null)
  const [expandedMove, setExpandedMove] = useState(null)
  const stats = useMemo(() => computeStats(moves), [moves])

  if (moves.length === 0) {
    return (
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Move Log</Typography>
        <Typography variant="body2">No moves logged yet. Play hands to see your moves, equity, optimal plays, and visual analytics here.</Typography>
      </Box>
    )
  }

  const maxAction = Math.max(...Object.values(stats.byAction).filter(Boolean), ...Object.values(stats.byOptimal).filter(Boolean), 1)

  return (
    <Box className="move-log" sx={{ maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Move Log</Typography>
        <Typography variant="body2">Your plays with equity, optimal comparison &amp; analytics</Typography>
      </Box>

      {/* Player Profile */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Player Profile</Typography>
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
                { value: stats.aggression, label: 'Aggression' },
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
          </div>
        </CardContent>
      </Card>

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

      {/* Equity Trend */}
      {stats.equityValues.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Equity Trend</Typography>
            <div className="equity-trend">
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption">First move</Typography>
                <Typography variant="caption">Last move</Typography>
              </Box>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Move List */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>All Moves</Typography>
          <Stack spacing={1}>
            {moves.map((m, i) => {
              const opt = (m.optimalMove || 'no_bet').toLowerCase()
              const act = (m.action || '').toLowerCase()
              const matched = act === opt || (act === 'check' && opt === 'no_bet')
              const isExpanded = expandedMove === i

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
                    <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5, fontSize: '0.85rem' }}>
                      <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{m.action}</Typography>
                      {m.amount > 0 && <Typography component="span" sx={{ color: '#f1c40f', fontSize: '0.85rem' }}>{formatMoney(m.amount)}</Typography>}
                      <Typography component="span" sx={{ color: '#a0a0c0', fontSize: '0.85rem' }}>
                        Eq: {m.equity != null ? `${Number(m.equity).toFixed(1)}%` : '—'}
                      </Typography>
                    </Box>
                  </Box>
                  <Collapse in={isExpanded}>
                    <Stack spacing={0.5} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', fontSize: '0.85rem' }}>
                      <Typography variant="body2">Your action: <strong>{m.action}</strong> {m.amount > 0 && formatMoney(m.amount)}</Typography>
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
