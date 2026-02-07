import { useState, useMemo } from 'react'
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
    if (m.street) {
      streetCorrect[m.street] = (streetCorrect[m.street] || 0) + (isCorrect ? 1 : 0)
    }
    if (m.equity != null) equityValues.push(Number(m.equity))
    if (a === 'raise' && m.amount != null && m.suggestedRaise != null) {
      raiseComparisons.push({ actual: m.amount, optimal: m.suggestedRaise })
    }
  })

  const adherence = total > 0 ? Math.round((matched / total) * 100) : 0
  const avgEquity = equityValues.length ? equityValues.reduce((s, e) => s + e, 0) / equityValues.length : null
  const totalCalls = byAction.call || 0
  const totalRaises = byAction.raise || 0
  const totalFolds = byAction.fold || 0
  const aggression = total > 0 ? Math.round(((totalRaises + totalCalls * 0.5) / total) * 100) : 0

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

  return {
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
  }
}

function EquityCell({ value, max = 100 }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0
  const intensity = pct / 100
  const r = Math.round(46 + (1 - intensity) * 200)
  const g = Math.round(204 + intensity * 51)
  const b = 46
  return (
    <div
      className="heatmap-cell equity-cell"
      style={{ backgroundColor: `rgb(${r},${g},${b})` }}
      title={`Equity: ${value != null ? value.toFixed(1) : '?'}%`}
    >
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
      <div className="move-log">
        <div className="move-log-hero">
          <h1>Move Log</h1>
          <p className="move-log-empty">No moves logged yet. Play hands to see your moves, equity, optimal plays, and visual analytics here.</p>
        </div>
      </div>
    )
  }

  const maxAction = Math.max(
    ...Object.values(stats.byAction).filter(Boolean),
    ...Object.values(stats.byOptimal).filter(Boolean),
    1
  )

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
    <div className="move-log">
      <div className="move-log-hero">
        <h1 className="move-log-title">Move Log</h1>
        <p className="move-log-subtitle">Your plays with equity, optimal comparison & analytics</p>
        <div className="move-log-meta">
          <span className="move-log-meta-item">Session: {stats.total} moves</span>
          {stats.optimalStreak > 0 && (
            <span className="move-log-streak optimal">🔥 {stats.optimalStreak} optimal in a row</span>
          )}
          {stats.deviateStreak > 0 && (
            <span className="move-log-streak deviate">⚠ {stats.deviateStreak} deviated in a row</span>
          )}
        </div>
      </div>

      {/* Live Insights */}
      <section className="move-log-section insights-section">
        <h2 className="section-title">Live Insights</h2>
        <div className="insights-grid">
          <div className="insight-card">
            <span className="insight-value">{stats.adherence}%</span>
            <span className="insight-label">Optimal play rate — bots exploit deviations</span>
          </div>
          <div className="insight-card">
            <span className="insight-value">{stats.aggression}</span>
            <span className="insight-label">Your aggression index (0–100) — bots use inverse</span>
          </div>
          {stats.riverPct != null && (
            <div className="insight-card">
              <span className="insight-value">{stats.riverPct}%</span>
              <span className="insight-label">River accuracy — critical street for bots</span>
            </div>
          )}
          {stats.avgRaiseDiff != null && (
            <div className="insight-card">
              <span className="insight-value">{stats.avgRaiseDiff >= 0 ? '+' : ''}{formatMoney(stats.avgRaiseDiff)}</span>
              <span className="insight-label">Avg raise vs optimal — sizing tells</span>
            </div>
          )}
          {stats.foldGap !== 0 && (
            <div className="insight-card">
              <span className="insight-value">{stats.foldGap > 0 ? '+' : ''}{stats.foldGap}%</span>
              <span className="insight-label">Fold rate vs optimal — exploitable if high</span>
            </div>
          )}
        </div>
      </section>

      {/* Player Profile */}
      <section className="move-log-section profile-section">
        <h2 className="section-title">Player Profile</h2>
        <div className="profile-card">
          <div className="profile-avatar">
            <span className="profile-avatar-emoji">🃏</span>
          <div
            className="profile-adherence-ring"
            style={{ ['--adherence']: stats.adherence }}
          >
            <div className="profile-adherence-inner" />
          </div>
          </div>
          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-value">{stats.total}</span>
              <span className="profile-stat-label">Moves</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{stats.adherence}%</span>
              <span className="profile-stat-label">Optimal</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">
                {stats.avgEquity != null ? stats.avgEquity.toFixed(1) : '—'}%
              </span>
              <span className="profile-stat-label">Avg Equity</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{stats.aggression}</span>
              <span className="profile-stat-label">Aggression</span>
            </div>
          </div>
          <div className="profile-tendencies">
            <div className="tendency-bar">
              <span className="tendency-label">Call</span>
              <div className="tendency-track">
                <div
                  className="tendency-fill tendency-call"
                  style={{ width: `${(stats.byAction.call / stats.total) * 100}%` }}
                />
              </div>
              <span className="tendency-val">{stats.byAction.call}</span>
            </div>
            <div className="tendency-bar">
              <span className="tendency-label">Raise</span>
              <div className="tendency-track">
                <div
                  className="tendency-fill tendency-raise"
                  style={{ width: `${(stats.byAction.raise / stats.total) * 100}%` }}
                />
              </div>
              <span className="tendency-val">{stats.byAction.raise}</span>
            </div>
            <div className="tendency-bar">
              <span className="tendency-label">Fold</span>
              <div className="tendency-track">
                <div
                  className="tendency-fill tendency-fold"
                  style={{ width: `${(stats.byAction.fold / stats.total) * 100}%` }}
                />
              </div>
              <span className="tendency-val">{stats.byAction.fold}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Optimal vs Actual Comparison */}
      <section className="move-log-section">
        <h2 className="section-title">Your Moves vs Optimal</h2>
        <div className="comparison-chart">
          {['call', 'raise', 'fold', 'check'].map((action) => (
            <div key={action} className="comparison-row">
              <span className="comparison-label">{action}</span>
              <div className="comparison-bars">
                <div className="comparison-bar-wrap">
                  <span className="comparison-bar-label">You</span>
                  <div className="comparison-bar-track">
                    <div
                      className={`comparison-bar-fill you ${action}`}
                      style={{ width: `${((stats.byAction[action] || 0) / maxAction) * 100}%` }}
                    />
                  </div>
                  <span className="comparison-bar-val">{stats.byAction[action] || 0}</span>
                </div>
                <div className="comparison-bar-wrap">
                  <span className="comparison-bar-label">Optimal</span>
                  <div className="comparison-bar-track">
                    <div
                      className={`comparison-bar-fill optimal ${action}`}
                      style={{
                        width: `${((action === 'check' ? (stats.byOptimal.check || 0) + (stats.byOptimal.no_bet || 0) : (stats.byOptimal[action] || 0)) / maxAction) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="comparison-bar-val">
                    {action === 'check' ? (stats.byOptimal.check || 0) + (stats.byOptimal.no_bet || 0) : stats.byOptimal[action] || 0}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Equity Heatmap */}
      <section className="move-log-section">
        <h2 className="section-title">Equity Heatmap</h2>
        <p className="section-hint">Each cell = one move. Darker green = higher equity.</p>
        <div className="equity-heatmap">
          {moves.map((m, i) => (
            <div
              key={i}
              className="heatmap-cell-wrap"
              onMouseEnter={() => setHoveredMove(i)}
              onMouseLeave={() => setHoveredMove(null)}
            >
              <EquityCell value={m.equity} />
            </div>
          ))}
        </div>
        {hoveredMove != null && moves[hoveredMove] && (
          <div className="heatmap-tooltip">
            Move #{hoveredMove + 1}: {moves[hoveredMove].action} on {moves[hoveredMove].street} — Equity:{' '}
            {moves[hoveredMove].equity != null ? `${Number(moves[hoveredMove].equity).toFixed(1)}%` : '—'}
          </div>
        )}
      </section>

      {/* Summary callout */}
      <section className="move-log-section summary-callout">
        <div className="summary-callout-inner">
          <span className="summary-callout-label">Session summary</span>
          <p className="summary-callout-text">
            {stats.total} decisions · {stats.matched} optimal ({stats.adherence}%) · Avg equity {stats.avgEquity != null ? `${stats.avgEquity.toFixed(1)}%` : '—'}.
            Bots in Train mode use your Move Log aggression to play against your weakness.
          </p>
        </div>
      </section>

      {/* Street Performance */}
      <section className="move-log-section">
        <h2 className="section-title">Performance by Street</h2>
        <div className="street-heatmap">
          {['preflop', 'flop', 'turn', 'river'].map((street) => {
            const total = stats.byStreet[street] || 0
            const correct = stats.streetCorrect[street] || 0
            const pct = total > 0 ? (correct / total) * 100 : 0
            return (
              <div key={street} className="street-cell">
                <span className="street-name">{street}</span>
                <div className="street-bar-wrap">
                  <div
                    className="street-bar-fill"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 70 ? '#2ecc71' : pct >= 50 ? '#f1c40f' : '#e74c3c',
                    }}
                  />
                </div>
                <span className="street-stat">{correct}/{total}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Raise Amount Comparison */}
      {stats.raiseComparisons.length > 0 && (
        <section className="move-log-section">
          <h2 className="section-title">Raise Amount: You vs Optimal</h2>
          <div className="raise-comparison-chart">
            {stats.raiseComparisons.map((r, i) => {
              const max = Math.max(r.actual, r.optimal, 0.1)
              return (
                <div key={i} className="raise-row">
                  <div className="raise-bar-wrap">
                    <div
                      className="raise-bar actual"
                      style={{ width: `${(r.actual / max) * 100}%` }}
                    />
                    <span className="raise-label">You: {formatMoney(r.actual)}</span>
                  </div>
                  <div className="raise-bar-wrap">
                    <div
                      className="raise-bar optimal"
                      style={{ width: `${(r.optimal / max) * 100}%` }}
                    />
                    <span className="raise-label">Opt: {formatMoney(r.optimal)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Equity Trend */}
      {stats.equityValues.length > 0 && (
        <section className="move-log-section">
          <h2 className="section-title">Equity Trend</h2>
          <div className="equity-trend">
            <svg viewBox="0 0 400 80" className="trend-svg" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="url(#equityGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={stats.equityValues
                  .map((v, i) => {
                    const denom = Math.max(stats.equityValues.length - 1, 1)
                    const x = (i / denom) * 400
                    const y = 70 - (v / 100) * 60
                    return `${x},${y}`
                  })
                  .join(' ')}
              />
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#e74c3c" />
                  <stop offset="50%" stopColor="#f1c40f" />
                  <stop offset="100%" stopColor="#2ecc71" />
                </linearGradient>
              </defs>
            </svg>
            <div className="trend-labels">
              <span>First move</span>
              <span>Last move</span>
            </div>
          </div>
        </section>
      )}

      {/* Move List */}
      <section className="move-log-section">
        <h2 className="section-title">All Moves</h2>
        <div className="move-log-list">
          {moves.map((m, i) => {
            const opt = (m.optimalMove || 'no_bet').toLowerCase()
            const act = (m.action || '').toLowerCase()
            const matched = act === opt || (act === 'check' && opt === 'no_bet')
            const isExpanded = expandedMove === i
            const isHovered = hoveredMove === i

            return (
              <div
                key={i}
                className={`move-log-entry ${matched ? 'matched' : 'deviated'} ${isExpanded ? 'expanded' : ''} ${isHovered ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredMove(i)}
                onMouseLeave={() => setHoveredMove(null)}
                onClick={() => setExpandedMove(isExpanded ? null : i)}
              >
                <div className="move-log-header">
                  <span className="move-log-hand">Hand #{m.handNumber ?? '—'}</span>
                  <span className="move-log-street">{m.street}</span>
                  {m.timestamp != null && (
                    <span className="move-log-time">{formatTimestamp(m.timestamp)}</span>
                  )}
                  <span className={`move-log-badge ${matched ? 'match' : 'deviate'}`}>
                    {matched ? '✓ Optimal' : '≠ Deviated'}
                  </span>
                </div>
                <div className="move-log-body">
                  <span className="move-log-action">{m.action}</span>
                  {m.amount > 0 && <span className="move-log-amount">{formatMoney(m.amount)}</span>}
                  <span className="move-log-equity">
                    Equity: {m.equity != null ? `${Number(m.equity).toFixed(1)}%` : '—'}
                  </span>
                  <span className="move-log-optimal">
                    Optimal: <strong>{m.optimalMove ?? '—'}</strong>
                  </span>
                  {m.pot != null && (
                    <span className="move-log-pot">Pot: {formatMoney(m.pot)}</span>
                  )}
                  {m.toCall != null && m.toCall > 0 && (
                    <span className="move-log-tocall">To call: {formatMoney(m.toCall)}</span>
                  )}
                </div>
                {isExpanded && (
                  <div className="move-log-detail">
                    <div className="detail-row">
                      <span>Your action:</span> <strong>{m.action}</strong> {m.amount > 0 && formatMoney(m.amount)}
                    </div>
                    <div className="detail-row">
                      <span>Optimal:</span> <strong>{m.optimalMove}</strong>
                      {m.suggestedRaise != null && m.action === 'raise' && (
                        <> (suggested raise: {formatMoney(m.suggestedRaise)})</>
                      )}
                    </div>
                    <div className="detail-row">
                      <span>Equity at decision:</span> {m.equity != null ? `${Number(m.equity).toFixed(1)}%` : '—'}
                    </div>
                    {m.timestamp != null && (
                      <div className="detail-row">
                        <span>Logged:</span> {new Date(m.timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
