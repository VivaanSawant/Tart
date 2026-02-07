import { useCallback, useEffect, useState } from 'react'
import { fetchTableState, tableAction, tableReset, tableSetHero } from '../api/backend'
import { getCardImage } from '../utils/cardImages'
import './TableSimulator.css'

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '$0.00'
  return '$' + Number(val).toFixed(2)
}

const HERO_KEYS = { 1: 'check', 2: 'call', 3: 'fold', 4: 'raise' }

function cardsNeededForStreet(street) {
  switch (street) {
    case 'preflop': return '2 hole cards'
    case 'flop': return '3 flop cards'
    case 'turn': return 'turn card'
    case 'river': return 'river card'
    default: return 'cards'
  }
}

export default function TableSimulatorView({
  holeCount = 0,
  flopCards = [],
  turnCard = null,
  riverCard = null,
  potInfo = null,
  equityPreflop = null,
  equityFlop = null,
  equityTurn = null,
  equityRiver = null,
  onHeroMove = null,
}) {
  const [state, setState] = useState(null)
  const [raiseAmount, setRaiseAmount] = useState(0.4)
  const [numPlayers, setNumPlayers] = useState(6)
  const [error, setError] = useState(null)

  const flopCount = flopCards.length
  const hasTurn = turnCard != null
  const hasRiver = riverCard != null

  const heroSeat = state?.hero_seat ?? null
  const heroPosition = state?.hero_position ?? null
  const currentActor = state?.current_actor ?? null
  const isMyTurn = heroSeat != null && currentActor === heroSeat
  const street = state?.street ?? 'preflop'
  const hasCardsForStreet =
    state &&
    ((street === 'preflop' && holeCount >= 2) ||
      (street === 'flop' && holeCount >= 2 && flopCount >= 3) ||
      (street === 'turn' && holeCount >= 2 && flopCount >= 3 && hasTurn) ||
      (street === 'river' && holeCount >= 2 && flopCount >= 3 && hasTurn && hasRiver))
  const canAct = !!hasCardsForStreet
  const costToCall = state?.cost_to_call ?? 0
  const canCheck = costToCall <= 0

  const loadState = async () => {
    const data = await fetchTableState()
    if (data) {
      setState(data)
      setError(null)
    } else {
      setError('Could not load table state')
    }
  }

  useEffect(() => {
    loadState()
    const interval = setInterval(loadState, 500)
    return () => clearInterval(interval)
  }, [])

  // Whenever a raise is recommended, auto-fill the raise amount input with suggested_raise
  useEffect(() => {
    if (potInfo?.recommendation !== 'raise') return
    const suggested = potInfo?.suggested_raise
    if (suggested != null) {
      const val = Number(suggested)
      if (!Number.isNaN(val) && val > 0) setRaiseAmount(val)
      return
    }
    // Fallback: half pot or min raise above cost to call
    const potBefore = potInfo?.pot_before_call
    const toCall = potInfo?.to_call ?? 0
    if (potBefore != null && Number(potBefore) > 0) {
      const halfPot = 0.5 * Number(potBefore)
      setRaiseAmount(Math.max(0.2, halfPot))
    } else if (toCall > 0) {
      setRaiseAmount(Math.max(0.4, toCall + 0.2))
    }
  }, [potInfo?.recommendation, potInfo?.suggested_raise, potInfo?.pot_before_call, potInfo?.to_call])

  const handleAction = useCallback(
    async (action, amount = 0, isHeroActing = false) => {
      if (!state || state.current_actor == null) return
      const equityForStreet =
        street === 'preflop' ? equityPreflop
        : street === 'flop' ? equityFlop
        : street === 'turn' ? equityTurn
        : street === 'river' ? equityRiver
        : null
      const res = await tableAction(state.current_actor, action, amount, isHeroActing)
      if (res && res.ok) {
        setState(res.state)
        setError(null)
        if (isHeroActing && onHeroMove) {
          onHeroMove({
            handNumber: state.hand_number,
            street,
            action,
            amount,
            equity: equityForStreet,
            optimalMove: potInfo?.recommendation ?? 'no_bet',
            suggestedRaise: potInfo?.suggested_raise,
            pot: state.pot,
            toCall: potInfo?.to_call,
          })
        }
      } else {
        setError(res?.error || 'Invalid action')
      }
    },
    [state, street, equityPreflop, equityFlop, equityTurn, equityRiver, potInfo?.recommendation, onHeroMove]
  )

  const handleHeroAction = useCallback(
    (action, amount = 0) => handleAction(action, amount, true),
    [handleAction]
  )

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!canAct || !state || state.current_actor == null) return
      if (!isMyTurn) return
      const key = e.key
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const action = HERO_KEYS[parseInt(key, 10)]
      if (action) {
        e.preventDefault()
        const cost = state.cost_to_call ?? 0
        const checkOk = cost <= 0
        if (action === 'check' && checkOk) handleHeroAction('check')
        else if (action === 'call' && cost > 0) handleHeroAction('call', cost)
        else if (action === 'fold') handleHeroAction('fold')
        else if (action === 'raise') handleHeroAction('raise', raiseAmount)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canAct, isMyTurn, state, handleHeroAction, raiseAmount])

  const handleReset = async () => {
    const res = await tableReset(numPlayers)
    if (res && res.ok) {
      setState(res.state)
      setError(null)
    } else {
      setError('Could not reset')
    }
  }

  const handleSetHero = useCallback(async (seat) => {
    const res = await tableSetHero(seat)
    if (res && res.ok) {
      setState(res.state)
      setError(null)
    } else {
      setError(res?.error || 'Could not set hero')
    }
  }, [])

  if (!state) {
    return (
      <div className="table-sim-view">
        <p className="table-sim-loading">Loading table…</p>
      </div>
    )
  }

  // Position seats around an ellipse (6–10 players)
  const n = state.num_players || 6
  const seatPositions = []
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    seatPositions.push({
      seat: i,
      x: 50 + 42 * Math.cos(angle),
      y: 50 + 38 * Math.sin(angle),
    })
  }

  return (
    <div className="table-sim-view">
      <header className="table-sim-header">
        <h1>Table Simulator</h1>
        <div className="table-sim-controls">
          <label>
            Players
            <select
              value={numPlayers}
              onChange={(e) => setNumPlayers(Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-reset" onClick={handleReset}>
            New table
          </button>
        </div>
        {heroPosition && (
          <div className="hero-position-badge">
            You are: <strong>{heroPosition}</strong>
          </div>
        )}
      </header>

      {error && <p className="table-sim-error">{error}</p>}

      <div className="table-container">
        <div className="table-felt">
          <div className="table-center">
            <div className="table-info-row">
              <div className="table-pot">Pot {formatMoney(state.pot)}</div>
              {(() => {
                const eq = hasRiver ? equityRiver
                  : hasTurn ? equityTurn
                  : flopCount >= 3 ? equityFlop
                  : holeCount >= 2 ? equityPreflop
                  : null
                if (eq == null) return null
                const pct = Number(eq)
                if (Number.isNaN(pct)) return null
                const color = pct >= 65 ? '#2ecc71' : pct >= 45 ? '#f1c40f' : '#e74c3c'
                return (
                  <div className="table-equity" style={{ color }}>
                    Equity: {pct.toFixed(1)}%
                  </div>
                )
              })()}
            </div>
            <div className="table-board">
              {[
                flopCards[0] || null,
                flopCards[1] || null,
                flopCards[2] || null,
                turnCard,
                riverCard,
              ].map((card, i) => {
                const img = card ? getCardImage(card) : null
                return (
                  <div key={i} className={`board-card-slot${img ? ' board-card-slot--filled' : ''}`}>
                    {img && <img src={img} alt={card} className="board-card-img" />}
                  </div>
                )
              })}
            </div>
          </div>

          {seatPositions.map(({ seat, x, y }) => {
            const inHand = state.players_in_hand?.includes(seat)
            const isCurrent = seat === currentActor
            const isDealer = seat === state.dealer_seat
            const isSB = seat === state.sb_seat
            const isBB = seat === state.bb_seat
            const bet = state.player_bets_this_street?.[String(seat)] ?? 0
            const isHero = seat === heroSeat

            return (
              <div
                key={seat}
                className={`seat seat-${seat} ${!inHand ? 'folded' : ''} ${isCurrent ? 'current' : ''}`}
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="seat-label">
                  Seat {seat}
                  {isHero && <span className="hero-badge">YOU</span>}
                </div>
                <div className="seat-badges">
                  {isDealer && <span className="badge dealer">D</span>}
                  {isSB && <span className="badge sb">SB</span>}
                  {isBB && <span className="badge bb">BB</span>}
                  {isCurrent && <span className="badge turn">→</span>}
                </div>
                {bet > 0 && <div className="seat-bet">{formatMoney(bet)}</div>}
                {heroSeat == null && (
                  <button
                    type="button"
                    className="btn btn-seat-hero"
                    onClick={(e) => { e.stopPropagation(); handleSetHero(seat) }}
                    title={`I'm Hero (Seat ${seat})`}
                  >
                    I&apos;m Hero
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="table-actions-panel">
        {heroSeat == null ? (
          <div className="hero-prompt">
            <h3>Click &quot;I&apos;m Hero&quot; on your seat</h3>
            <p className="hero-prompt-hint">
              Each seat has an &quot;I&apos;m Hero&quot; button. Click yours, then you&apos;ll see your Call/Fold/Raise
              when it&apos;s your turn and simulate opponents when it&apos;s not.
            </p>
          </div>
        ) : (
          <h3>
            {currentActor != null ? (
              isMyTurn ? (
                canAct ? (
                  <>Your turn (Seat {currentActor}, {heroPosition})</>
                ) : (
                  <>Your turn — waiting for CV to detect {cardsNeededForStreet(street)}</>
                )
              ) : (
                canAct ? (
                  <>Seat {currentActor} to act</>
                ) : (
                  <>Waiting for CV to detect {cardsNeededForStreet(street)}</>
                )
              )
            ) : (
              <>Waiting for next hand</>
            )}
          </h3>
        )}

        {currentActor != null && isMyTurn && (
          <div className="action-buttons">
            {!canAct ? (
              <p className="table-sim-waiting">
                Show {cardsNeededForStreet(street)} to the camera to act.
              </p>
            ) : (
              <>
                <div className="hero-actions-label">
                  Hero acts: use keys <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> or click
                </div>
                {canCheck && (
                  <button
                    type="button"
                    className="btn btn-action btn-check"
                    onClick={() => handleAction('check', 0, true)}
                  >
                    Check <span className="kbd">1</span>
                  </button>
                )}
                {costToCall > 0 && (
                  <button
                    type="button"
                    className="btn btn-action btn-call"
                    onClick={() => handleAction('call', costToCall, true)}
                  >
                    Call {formatMoney(costToCall)} <span className="kbd">2</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-action btn-fold"
                  onClick={() => handleAction('fold', 0, true)}
                >
                  Fold <span className="kbd">3</span>
                </button>
                <div className="raise-row">
                  <button
                    type="button"
                    className="btn btn-action btn-raise"
                    onClick={() => handleAction('raise', raiseAmount, true)}
                  >
                    Raise <span className="kbd">4</span>
                  </button>
                  <input
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value) || 0.2)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {currentActor != null && !isMyTurn && (
          <div className="simulate-others">
            <p className="simulate-label">Simulate other player (Seat {currentActor})</p>
            <div className="action-buttons simulate-buttons">
              {canCheck && (
                <button
                  type="button"
                  className="btn btn-action btn-sim"
                  onClick={() => handleAction('check', 0, false)}
                >
                  Check
                </button>
              )}
              {costToCall > 0 && (
                <button
                  type="button"
                  className="btn btn-action btn-sim"
                  onClick={() => handleAction('call', costToCall, false)}
                >
                  Call {formatMoney(costToCall)}
                </button>
              )}
              <button
                type="button"
                className="btn btn-action btn-sim"
                onClick={() => handleAction('fold', 0, false)}
              >
                Fold
              </button>
              <div className="raise-row">
                <button
                  type="button"
                  className="btn btn-action btn-sim"
                  onClick={() => handleAction('raise', raiseAmount, false)}
                >
                  Raise
                </button>
                <input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value) || 0.2)}
                  title="Raise amount"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
