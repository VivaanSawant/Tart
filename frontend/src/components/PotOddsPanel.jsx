function formatNumber(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) {
    return '—'
  }
  return Number(val).toFixed(1)
}

export default function PotOddsPanel({
  potInputs,
  potInfo,
  onStartingPotChange,
  onStreetChange,
  onBetChange,
}) {
  const recommendation = potInfo?.recommendation || 'no_bet'
  const recommendationText =
    recommendation === 'call' ? 'CALL' : recommendation === 'fold' ? 'FOLD' : '—'

  return (
    <div className="section">
      <h2>Pot &amp; betting</h2>
      <div className="pot-section">
        <div className="pot-row">
          <label>Starting pot</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={potInputs.starting_pot}
            onChange={(e) => onStartingPotChange(e.target.value)}
          />
          <span className="pot-hint">(e.g. blinds)</span>
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
        <h3>Opponent / Hero per street</h3>
        {['preflop', 'flop', 'turn', 'river'].map((street) => (
          <div className="pot-row" key={street}>
            <label>{street[0].toUpperCase() + street.slice(1)}</label>
            Opp:
            <input
              type="number"
              min="0"
              step="0.5"
              value={potInputs[street].opponent}
              onChange={(e) => onBetChange(street, 'opponent', e.target.value)}
            />
            Hero:
            <input
              type="number"
              min="0"
              step="0.5"
              value={potInputs[street].hero}
              onChange={(e) => onBetChange(street, 'hero', e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="pot-odds-result">
        <p className="line">
          Pot (before your call): <strong>{formatNumber(potInfo?.pot_before_call)}</strong>
        </p>
        <p className="line">
          To call: <strong>{formatNumber(potInfo?.to_call)}</strong>
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
