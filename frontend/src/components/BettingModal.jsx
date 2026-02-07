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
  onSubmit,
}) {
  const [costToCall, setCostToCall] = useState(0.2)

  useEffect(() => {
    if (open) {
      setCostToCall(Number(defaultCostToCall) || 0.2)
    }
  }, [open, defaultCostToCall])

  if (!open || !street) {
    return null
  }

  const handleCall = () => {
    onSubmit(street, costToCall, true)
  }

  const handleFold = () => {
    onSubmit(street, costToCall, false)
  }

  return (
    <div className="modal-overlay visible" role="dialog" aria-modal="true">
      <div className="modal-box">
        <h2>Enter {STREET_LABELS[street] || street} betting</h2>
        <p>What was the cost to call on this street? Then choose Call or Fold.</p>
        <div className="modal-row">
          <label>Cost to call</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={costToCall}
            onChange={(e) => setCostToCall(Number(e.target.value) || 0)}
          />
        </div>
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
