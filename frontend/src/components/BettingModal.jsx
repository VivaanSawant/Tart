import { useEffect, useState } from 'react'

const STREET_LABELS = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

export default function BettingModal({
  open,
  street,
  defaultOpponent,
  defaultHero,
  onSubmit,
}) {
  const [opponent, setOpponent] = useState(0)
  const [hero, setHero] = useState(0)

  useEffect(() => {
    if (open) {
      setOpponent(defaultOpponent ?? 0)
      setHero(defaultHero ?? 0)
    }
  }, [open, defaultOpponent, defaultHero])

  if (!open || !street) {
    return null
  }

  return (
    <div className="modal-overlay visible" role="dialog" aria-modal="true">
      <div className="modal-box">
        <h2>Enter {STREET_LABELS[street] || street} betting</h2>
        <p>Enter amounts for this street (0 = check). Then continue to scan for the next cards.</p>
        <div className="modal-row">
          <label>Opponent</label>
          <button type="button" className="btn btn-check" onClick={() => setOpponent(0)}>
            Check (0)
          </button>
          <span>or Bet</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={opponent}
            onChange={(e) => setOpponent(Number(e.target.value) || 0)}
          />
        </div>
        <div className="modal-row">
          <label>Hero (you)</label>
          <button type="button" className="btn btn-check" onClick={() => setHero(0)}>
            Check (0)
          </button>
          <button type="button" className="btn btn-bet" onClick={() => setHero(opponent)}>
            Call
          </button>
          <span>or Bet</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={hero}
            onChange={(e) => setHero(Number(e.target.value) || 0)}
          />
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSubmit(street, opponent, hero)}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
