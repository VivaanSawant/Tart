function formatMoney(val) {
  if (val == null || val === undefined || Number.isNaN(Number(val))) return '—'
  return '$' + Number(val).toFixed(2)
}

function formatEquity(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) {
    return null
  }
  return Number(val).toFixed(1)
}

function equityColor(pct) {
  if (pct == null || pct < 0) return 'var(--equity-low)'
  if (pct < 35) return 'var(--equity-low)'
  if (pct < 50) return 'var(--equity-medium-low)'
  if (pct < 65) return 'var(--equity-medium)'
  if (pct < 80) return 'var(--equity-medium-high)'
  return 'var(--equity-high)'
}

function EquityBar({ street, value }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0
  const displayVal = formatEquity(value)
  const fillStyle = {
    width: displayVal != null ? `${pct}%` : '0%',
    backgroundColor: equityColor(value),
  }
  return (
    <div className="equity-bar-row">
      <div className="equity-bar-label">
        <span className="equity-street">{street}</span>
        <span className="equity-value">
          {displayVal != null ? `${displayVal}% chance to win` : '—'}
        </span>
      </div>
      <div className="equity-bar-track">
        <div className="equity-bar-fill" style={fillStyle} />
      </div>
    </div>
  )
}

export default function EquityPanel({
  equityPreflop,
  equityFlop,
  equityTurn,
  equityRiver,
  equityError,
  betRecommendations,
  potInfo,
  holeCount,
  flopCount,
  playersInHand = 2,
}) {
  const hasHole = holeCount >= 2
  const hasFullData = holeCount >= 2 && flopCount >= 3
  const recs = betRecommendations || {}
  const oppCount = Math.max(0, playersInHand - 1)

  let message = ''
  if (equityError) {
    message = equityError
  } else if (!hasHole) {
    message = 'Lock 2 hole cards to see preflop equity.'
  } else if (!hasFullData) {
    message = 'Lock 3 flop cards to see postflop equity and bet recommendations.'
  } else {
    message = `Equity = % chance to win vs ${oppCount} opponent${oppCount !== 1 ? 's' : ''} (from table).`
  }

  return (
    <div className="section equity-panel">
      <h2>Win probability &amp; bet advice</h2>
      <p className="equity-subtitle">{message}</p>

      <div className="equity-heatmap">
        <EquityBar street="Preflop" value={equityPreflop} />
        <EquityBar street="Flop" value={equityFlop} />
        <EquityBar street="Turn" value={equityTurn} />
        <EquityBar street="River" value={equityRiver} />
      </div>

      {(hasHole || hasFullData) && potInfo && (
        <div className="equity-bet-recommendation">
          <h3>Bet recommendation</h3>
          {potInfo.to_call > 0 ? (
            <p className={`equity-verdict ${potInfo.recommendation || 'no_bet'}`}>
              {potInfo.recommendation === 'call' && (
                <>CALL {formatMoney(potInfo.to_call)} (pot odds)</>
              )}
              {potInfo.recommendation === 'fold' && (
                <>FOLD — need {formatMoney(potInfo.to_call)} to call, pot odds say no</>
              )}
              {potInfo.recommendation === 'raise' && (
                <>RAISE (strong hand vs {formatMoney(potInfo.to_call)} to call)</>
              )}
              {potInfo.recommendation === 'check' && <>CHECK</>}
              {potInfo.recommendation === 'no_bet' && <>No bet to call</>}
            </p>
          ) : (
            <p className={`equity-verdict ${potInfo.recommendation || 'no_bet'}`}>
              {potInfo.recommendation === 'raise' && <>RAISE — bet ½–⅔ pot for value</>}
              {potInfo.recommendation === 'check' && <>CHECK or small bet</>}
              {!['raise', 'check'].includes(potInfo.recommendation) && (
                <>No bet to call — check or bet</>
              )}
            </p>
          )}
        </div>
      )}

      {hasFullData && (
        <div className="bet-recommendations">
          <h3>Bet recommendation by street</h3>
          <div className="bet-rec-grid">
            <div className="bet-rec-row">
              <span className="bet-rec-street">Preflop</span>
              <span className="bet-rec-text">{recs.preflop || '—'}</span>
            </div>
            <div className="bet-rec-row">
              <span className="bet-rec-street">Flop</span>
              <span className="bet-rec-text">{recs.flop || '—'}</span>
            </div>
            <div className="bet-rec-row">
              <span className="bet-rec-street">Turn</span>
              <span className="bet-rec-text">{recs.turn || '—'}</span>
            </div>
            <div className="bet-rec-row">
              <span className="bet-rec-street">River</span>
              <span className="bet-rec-text">{recs.river || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
