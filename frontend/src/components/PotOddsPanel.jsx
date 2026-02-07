function formatNumber(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) {
    return '—'
  }
  return Number(val).toFixed(1)
}

function formatMoney(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) {
    return '—'
  }
  return '$' + Number(val).toFixed(2)
}

export default function PotOddsPanel({
  potInfo,
  smallBlind = 0.1,
  bigBlind = 0.2,
  buyIn = 10,
}) {
  const recommendation = potInfo?.recommendation || 'no_bet'
  const recommendationText =
    recommendation === 'call'
      ? 'CALL'
      : recommendation === 'fold'
        ? 'FOLD'
        : recommendation === 'raise'
          ? 'RAISE'
          : recommendation === 'check'
            ? 'CHECK'
            : '—'
  const toCall = potInfo?.to_call ?? 0
  const hasBetToCall = toCall > 0

  return (
    <div className="section">
      <h2>Pot &amp; odds (from table)</h2>

      <div className="game-info">
        <span>Blinds: {formatMoney(smallBlind)} / {formatMoney(bigBlind)}</span>
        <span>Buy-in: {formatMoney(buyIn)}</span>
      </div>

      <div className="bet-amount-display">
        {hasBetToCall ? (
          <>
            <span className="bet-amount-label">Amount to call</span>
            <span className="bet-amount-value">{formatMoney(toCall)}</span>
          </>
        ) : (
          <>
            <span className="bet-amount-label">No bet to call</span>
            <span className="bet-amount-value bet-amount-check">Check or bet</span>
          </>
        )}
      </div>

      <div className="pot-odds-result">
        {hasBetToCall && (
          <>
            <p className="line">
              Pot (before your call): <strong>{formatMoney(potInfo?.pot_before_call)}</strong>
            </p>
            <p className="line">
              To call: <strong>{formatMoney(potInfo?.to_call)}</strong>
            </p>
            <p className="line pot-odds-formula">
              Pot odds: risk {formatMoney(potInfo?.to_call)} to win{' '}
              {formatMoney((potInfo?.pot_before_call ?? 0) + (potInfo?.to_call ?? 0))} → need{' '}
              <strong>{formatNumber(potInfo?.required_equity_pct)}%</strong> equity to call
            </p>
          </>
        )}
        <p className="recommendation-row">
          Recommendation:{' '}
          <span className={`recommendation ${recommendation}`}>{recommendationText}</span>
        </p>
        <p className="status" style={{ marginTop: '6px' }}>
          {potInfo?.recommendation_reason || ''}
        </p>
      </div>
    </div>
  )
}
