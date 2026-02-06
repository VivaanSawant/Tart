function CardRow({ cards, type, onClick, disabled }) {
  if (!cards.length) {
    return null
  }

  return cards.map((card) => {
    const className = `card-chip ${type || ''}${onClick ? ' clickable' : ''}`
    if (onClick) {
      return (
        <button
          key={card}
          type="button"
          className={className}
          onClick={() => onClick(card)}
          disabled={disabled}
        >
          {card}
        </button>
      )
    }
    return (
      <span key={card} className={className}>
        {card}
      </span>
    )
  })
}

export default function CardsPanel({
  holeCards,
  availableCards,
  flopCards,
  turnCard,
  riverCard,
  canLockHole,
  holeHint,
  onLockHole,
  onLockHoleAll,
}) {
  const flopDone = flopCards.length >= 3
  const turnDone = Boolean(turnCard)
  const riverDone = Boolean(riverCard)

  return (
    <>
      <div className="section">
        <h2>Your hole cards</h2>
        <div id="hole-cards" className="cards-row">
          <CardRow cards={holeCards} type="hole" onClick={onLockHole} />
        </div>
        <p id="hole-hint" className="status">
          {holeHint}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          id="lock-hole-btn"
          onClick={onLockHoleAll}
          disabled={!canLockHole}
        >
          Lock hole (1 click)
        </button>
      </div>

      <div className="section">
        <h2>Detected (not yet locked)</h2>
        <div id="available-cards" className="cards-row">
          <CardRow
            cards={availableCards}
            type=""
            onClick={onLockHole}
            disabled={!canLockHole}
          />
        </div>
      </div>

      <div className="section">
        <h2>Flop</h2>
        <div id="flop-cards" className="cards-row">
          <CardRow cards={flopCards} type="flop" />
        </div>
        <p
          id="flop-status"
          className={`status ${flopDone ? 'done' : 'waiting'}`}
        >
          {flopDone ? 'Locked (3 cards).' : 'Waiting for 3 cards stable 2s…'}
        </p>
      </div>

      <div className="section">
        <h2>Turn</h2>
        <div id="turn-cards" className="cards-row">
          <CardRow cards={turnCard ? [turnCard] : []} type="turn" />
        </div>
        <p
          id="turn-status"
          className={`status ${turnDone ? 'done' : 'waiting'}`}
        >
          {turnDone ? 'Locked.' : 'Waiting for 1 card stable 2s…'}
        </p>
      </div>

      <div className="section">
        <h2>River</h2>
        <div id="river-cards" className="cards-row">
          <CardRow cards={riverCard ? [riverCard] : []} type="river" />
        </div>
        <p
          id="river-status"
          className={`status ${riverDone ? 'done' : 'waiting'}`}
        >
          {riverDone ? 'Locked.' : 'Waiting for 1 card stable 2s…'}
        </p>
      </div>

    </>
  )
}
