function formatEquity(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) {
    return '—'
  }
  return Number(val).toFixed(1)
}

export default function EquityPanel({
  equityFlop,
  equityTurn,
  equityRiver,
  equityError,
  holeCount,
  flopCount,
}) {
  let message = ''
  if (equityError) {
    message = equityError
  } else if (holeCount < 2 || flopCount < 3) {
    message = 'Lock 2 hole cards + 3 flop to see equity and recommendation.'
  } else {
    message = 'State also logged to card_log.json'
  }

  return (
    <div className="section">
      <h2>Predicted equity</h2>
      <p className="equity-row">
        Flop: <span className="equity-num">{formatEquity(equityFlop)}</span>
      </p>
      <p className="equity-row">
        Turn: <span className="equity-num">{formatEquity(equityTurn)}</span>
      </p>
      <p className="equity-row">
        River: <span className="equity-num">{formatEquity(equityRiver)}</span>
      </p>
      <p className="status equity-msg">{message}</p>
    </div>
  )
}
