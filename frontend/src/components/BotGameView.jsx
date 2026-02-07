import { useCallback, useEffect, useState } from 'react'
import { botAction, botFetchState, botNextHand, botStart } from '../api/backend'
import { getCardImage } from '../utils/cardImages'
import './TableSimulator.css'

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '$0.00'
  return '$' + Number(val).toFixed(2)
}

export default function BotGameView() {
  const [state, setState] = useState(null)
  const [raiseAmount, setRaiseAmount] = useState(0.4)
  const [error, setError] = useState(null)

  const heroSeat = state?.hero_seat ?? 0
  const holeCards = state?.hole_cards?.[heroSeat] ?? []
  const flopCards = state?.flop ?? []
  const turnCard = state?.turn ?? null
  const riverCard = state?.river ?? null
  const currentActor = state?.current_actor ?? null
  const isMyTurn = currentActor === heroSeat
  const street = state?.street ?? 'preflop'
  const showdown = state?.showdown ?? null

  const flopCount = flopCards.length
  const hasTurn = turnCard != null
  const hasRiver = riverCard != null
  const hasCardsForStreet =
    state &&
    ((street === 'preflop' && holeCards.length >= 2) ||
      (street === 'flop' && holeCards.length >= 2 && flopCount >= 3) ||
      (street === 'turn' && holeCards.length >= 2 && flopCount >= 3 && hasTurn) ||
      (street === 'river' && holeCards.length >= 2 && flopCount >= 3 && hasTurn && hasRiver))
  const canAct = !!hasCardsForStreet
  const costToCall = state?.cost_to_call ?? 0
  const canCheck = costToCall <= 0

  const loadState = useCallback(async () => {
    const data = await botFetchState()
    if (data) {
      setState(data)
      setError(null)
    } else {
      setError('Could not load bot game state')
    }
  }, [])

  useEffect(() => {
    loadState()
    const interval = setInterval(loadState, 500)
    return () => clearInterval(interval)
  }, [loadState])

  useEffect(() => {
    if (state?.pot && state.pot > 0) {
      setRaiseAmount(Math.max(0.2, 0.5 * state.pot))
    }
  }, [state?.pot])

  const handleAction = useCallback(
    async (action, amount = 0) => {
      const res = await botAction(action, amount)
      if (res && res.ok && res.state) {
        setState(res.state)
        setError(null)
      } else {
        setError(res?.error || 'Invalid action')
      }
    },
    []
  )

  const handleNextHand = useCallback(async () => {
    const res = await botNextHand()
    if (res?.ok && res.state) {
      setState(res.state)
      setError(null)
    }
  }, [])

  const handleNewGame = useCallback(async () => {
    const res = await botStart(6)
    if (res) {
      setState(res)
      setError(null)
    }
  }, [])

  if (!state) {
    return (
      <div className="table-sim-view">
        <p className="table-sim-loading">Loading bot game…</p>
        <button type="button" className="btn btn-reset" onClick={handleNewGame}>
          Start new game
        </button>
      </div>
    )
  }

  const n = state.num_players || 6
  const seatPositions = []
  const L = 5, R = 95, T = 8, B = 92
  const W = R - L
  const H = B - T
  const halfW = W / 2
  const perim = 2 * (W + H)

  for (let i = 0; i < n; i++) {
    const d = ((i / n) * perim) % perim
    let x, y
    if (d <= halfW) {
      x = 50 + d
      y = T
    } else if (d <= halfW + H) {
      x = R
      y = T + (d - halfW)
    } else if (d <= halfW + H + W) {
      x = R - (d - halfW - H)
      y = B
    } else if (d <= halfW + H + W + H) {
      x = L
      y = B - (d - halfW - H - W)
    } else {
      x = L + (d - halfW - H - W - H)
      y = T
    }
    seatPositions.push({ seat: i, x, y })
  }

  const board = [flopCards[0] || null, flopCards[1] || null, flopCards[2] || null, turnCard, riverCard]
  const showdownHands = showdown?.hands ?? {}
  const showdownBoard = showdown?.board ?? {}
  const showdownFlop = showdownBoard.flop ?? []
  const showdownTurn = showdownBoard.turn ?? null
  const showdownRiver = showdownBoard.river ?? null

  return (
    <div className="table-sim-view">
      {error && <p className="table-sim-error">{error}</p>}

      <div className="table-container">
        <div className="table-felt">
          <div className="table-center">
            <div className="table-info-row">
              <div className="table-pot">Pot {formatMoney(state.pot)}</div>
            </div>
            <div className="table-board">
              {(showdown ? [showdownFlop[0], showdownFlop[1], showdownFlop[2], showdownTurn, showdownRiver] : board).map((card, i) => {
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
            const cardsForSeat = showdown ? showdownHands[seat] : (isHero ? holeCards : null)

            return (
              <div
                key={seat}
                className={`seat seat-${seat} ${!inHand ? 'folded' : ''} ${isCurrent ? 'current' : ''} ${isHero ? 'hero' : ''}`}
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
                  {isCurrent && !showdown && <span className="badge turn">→</span>}
                  {showdown && showdown.winner_seat === seat && (
                    <span className="badge" style={{ background: '#2ecc71', color: '#1a1a2e' }}>WIN</span>
                  )}
                </div>
                {bet > 0 && <div className="seat-bet">{formatMoney(bet)}</div>}
                {cardsForSeat && (
                  <div className="hero-hole-cards">
                    <div className="hero-hole-slots">
                      {[cardsForSeat[0] || null, cardsForSeat[1] || null].map((card, ci) => {
                        const img = card ? getCardImage(card) : null
                        return (
                          <div key={ci} className={`hero-hole-slot${img ? ' hero-hole-slot--filled' : ''}`}>
                            {img && <img src={img} alt={card} className="hero-hole-img" />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showdown ? (
        <div className="actions-hud">
          <div className="showdown-result">
            {showdown.winner_seat != null ? (
              <span>Seat {showdown.winner_seat} wins {formatMoney(state.pot)}!</span>
            ) : (
              <span>Hand over</span>
            )}
          </div>
          <button type="button" className="btn btn-action btn-call hud-btn" onClick={handleNextHand}>
            Next hand
          </button>
        </div>
      ) : currentActor != null && (
        <div className="actions-hud">
          {isMyTurn && canAct && (
            <div className="hud-row">
              {canCheck && (
                <button type="button" className="btn btn-action btn-check hud-btn" onClick={() => handleAction('check', 0)}>
                  Check
                </button>
              )}
              {costToCall > 0 && (
                <button type="button" className="btn btn-action btn-call hud-btn" onClick={() => handleAction('call', costToCall)}>
                  Call {formatMoney(costToCall)}
                </button>
              )}
              <button type="button" className="btn btn-action btn-fold hud-btn" onClick={() => handleAction('fold', 0)}>
                Fold
              </button>
              <button type="button" className="btn btn-action btn-raise hud-btn" onClick={() => handleAction('raise', raiseAmount)}>
                Raise
              </button>
              <input
                type="number"
                className="hud-raise-input"
                min="0.01"
                step="0.1"
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Number(e.target.value) || 0.2)}
              />
            </div>
          )}
          {!isMyTurn && (
            <div className="hud-row">
              <span className="hud-seat-label">Seat {currentActor} (bot) is acting…</span>
            </div>
          )}
        </div>
      )}

      <div className="bot-game-header" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-reset" onClick={handleNewGame}>
          New game
        </button>
      </div>
    </div>
  )
}
