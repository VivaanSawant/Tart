import { useEffect, useState } from 'react'

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
  defaultCostToCall = 0.2,
  recommendation = null,
  toCall = null,
  onCostToCallChange,
  onSubmit,
}) {
  const [costToCall, setCostToCall] = useState(0.2)

  // Only initialize when modal opens or street changes — don't reset while user is typing
  useEffect(() => {
    if (open && street) {
      const value = Number(defaultCostToCall) || 0.2
      setCostToCall(value)
      onCostToCallChange?.(street, value)
    }
  }, [open, street])

  if (!open || !street) {
    return null
  }

  const handleCostChange = (value) => {
    const num = Number(value) || 0
    setCostToCall(num)
    onCostToCallChange?.(street, num)
  }

  const handleCall = () => {
    onSubmit(street, costToCall, true)
  }

  const handleFold = () => {
    onSubmit(street, costToCall, false)
  }

  const showRecommendation = recommendation && (recommendation === 'call' || recommendation === 'fold')

  return (
    <div className="modal-overlay visible" role="dialog" aria-modal="true">
      <div className="modal-box">
        <h2>{STREET_LABELS[street] || street} — amount to call</h2>
        <p>Enter how much you need to put in to call on this street. Then choose Call or Fold.</p>
        <div className="modal-row">
          <label>Amount to call</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={costToCall}
            onChange={(e) => handleCostChange(e.target.value)}
          />
        </div>
        {showRecommendation && (
          <p className={`modal-recommendation equity-verdict ${recommendation}`}>
            {recommendation === 'call' && <>Recommendation: CALL {formatMoney(toCall ?? costToCall)}</>}
            {recommendation === 'fold' && (
              <>Recommendation: FOLD (need {formatMoney(toCall ?? costToCall)} to call)</>
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
