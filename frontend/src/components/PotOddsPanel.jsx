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
  potInputs,
  potInfo,
  onStartingPotChange,
  onStreetChange,
  onCostToCallChange,
  smallBlind = 0.1,
  bigBlind = 0.2,
  buyIn = 10,
}) {
  const recommendation = potInfo?.recommendation || 'no_bet'
  const recommendationText =
    recommendation === 'call' ? 'CALL' : recommendation === 'fold' ? 'FOLD' : '—'
  const toCall = potInfo?.to_call ?? 0
  const hasBetToCall = toCall > 0

  return (
    <div className="section">
      <h2>Pot &amp; betting</h2>

      <div className="game-info">
        <span>Blinds: {formatMoney(smallBlind)} / {formatMoney(bigBlind)}</span>
        <span>Buy-in: {formatMoney(buyIn)}</span>
      </div>

      <div className="bet-amount-display">
        {hasBetToCall ? (
          <>
            <span className="bet-amount-label">Amount to bet (call)</span>
            <span className="bet-amount-value">{formatMoney(toCall)}</span>
          </>
        ) : (
          <>
            <span className="bet-amount-label">No bet to call</span>
            <span className="bet-amount-value bet-amount-check">Check or bet</span>
          </>
        )}
      </div>

      <div className="pot-section">
        <div className="pot-row">
          <label>Starting pot</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={potInputs.starting_pot}
            onChange={(e) => onStartingPotChange(e.target.value)}
          />
          <span className="pot-hint">(blinds)</span>
        </div>
        <div className="pot-row">
          <label>Deciding on</label>
          <select
            value={potInputs.current_street}
            onChange={(e) => onStreetChange(e.target.value)}
          >
            <option value="preflop">Preflop</option>
            <option value="flop">Flop</option>
            <option value="turn">Turn</option>
            <option value="river">River</option>
          </select>
        </div>
      </div>

      <div className="pot-section">
        <h3>Cost to call per street</h3>
        {['preflop', 'flop', 'turn', 'river'].map((street) => {
          const cost = (potInputs[street]?.opponent ?? 0) - (potInputs[street]?.hero ?? 0)
          return (
            <div className="pot-row" key={street}>
              <label>{street[0].toUpperCase() + street.slice(1)}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => onCostToCallChange(street, e.target.value)}
              />
              <span className="pot-hint">$</span>
            </div>
          )
        })}
      </div>

      <div className="pot-odds-result">
        <p className="line">
          Pot (before your call): <strong>{formatMoney(potInfo?.pot_before_call)}</strong>
        </p>
        <p className="line">
          To call: <strong>{formatMoney(potInfo?.to_call)}</strong>
        </p>
        <p className="line">
          Required equity:{' '}
          <strong>{formatNumber(potInfo?.required_equity_pct)}</strong>%
        </p>
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
