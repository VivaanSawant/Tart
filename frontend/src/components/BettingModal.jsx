const STREET_LABELS = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '$0.00'
  return '$' + Number(val).toFixed(2)
}

export default function BettingModal({
  open,
  street,
  costToCall = 0.2,
  recommendation = null,
  onSubmit,
}) {
  if (!open || !street) {
    return null
  }

  const handleCall = () => {
    onSubmit(street, Number(costToCall) || 0, true)
  }

  const handleFold = () => {
    onSubmit(street, 0, false)
  }

  const showRecommendation = recommendation && (recommendation === 'call' || recommendation === 'fold')

  return (
    <div className="modal-overlay visible" role="dialog" aria-modal="true">
      <div className="modal-box">
        <h2>{STREET_LABELS[street] || street} — amount to call</h2>
        <p>Cost to call (from table): {formatMoney(costToCall)}. Choose Call or Fold.</p>
        {showRecommendation && (
          <p className={`modal-recommendation equity-verdict ${recommendation}`}>
            {recommendation === 'call' && <>Recommendation: CALL {formatMoney(costToCall)}</>}
            {recommendation === 'fold' && (
              <>Recommendation: FOLD (need {formatMoney(costToCall)} to call)</>
            )}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={handleCall}>
            Call {formatMoney(costToCall)}
          </button>
          <button type="button" className="btn btn-fold" onClick={handleFold}>
            Fold
          </button>
        </div>
      </div>
    </div>
  )
}
