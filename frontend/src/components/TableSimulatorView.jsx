import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTableState, tableAction, tableReset, tableSetHero, transcribeChunk } from '../api/backend'
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

/* ---------- voice command parser ---------- */
const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100,
}

function spokenToNumber(str) {
  const s = str.toLowerCase().trim()
  const direct = parseFloat(s)
  if (!isNaN(direct)) return direct

  let total = 0
  const words = s.split(/\s+/)
  for (const w of words) {
    const n = WORD_TO_NUM[w]
    if (n !== undefined) {
      if (n === 100) total = total === 0 ? 100 : total * 100
      else total += n
    }
  }
  return total || null
}

function parseVoiceCommand(transcript) {
  if (!transcript) return null
  const t = transcript.toLowerCase().trim()

  if (/\bfold\b/.test(t)) return { action: 'fold' }
  if (/\bcheck\b/.test(t)) return { action: 'check' }
  if (/\ball[\s-]?in\b/.test(t)) return { action: 'allin' }

  // "call 20 cents" / "call fifty" / "call 1.50" / "call" (no amount)
  const callMatch = t.match(/\bcall(?:\s+(.+))?/)
  if (callMatch) {
    if (!callMatch[1]) return { action: 'call', amount: null }
    const rest = callMatch[1]
    const isCents = /\bcents?\b/.test(rest)
    const numPart = rest.replace(/\bcents?\b|\bdollars?\b/g, '').trim()
    let amount = spokenToNumber(numPart)
    if (amount != null && isCents) amount = amount / 100
    return { action: 'call', amount: amount }
  }

  // "raise 50" / "raise to 100" / "raise 1 dollar"
  const raiseMatch = t.match(/\braise\s+(?:to\s+)?(.+)/)
  if (raiseMatch) {
    const rest = raiseMatch[1]
    const isCents = /\bcents?\b/.test(rest)
    const numPart = rest.replace(/\bcents?\b|\bdollars?\b/g, '').trim()
    let amount = spokenToNumber(numPart)
    if (amount != null && isCents) amount = amount / 100
    return { action: 'raise', amount: amount }
  }

  return null
}

/* ---------- component ---------- */
export default function TableSimulatorView({
  holeCards = [],
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
  trainMode = false,
  opponentCards = null,
  playerAnalyses = null,
}) {
  const [state, setState] = useState(null)
  const [raiseAmount, setRaiseAmount] = useState(0.4)
  const [numPlayers, setNumPlayers] = useState(6)
  const [error, setError] = useState(null)

  const flopCount = flopCards.length
  const hasTurn = turnCard != null
  const hasRiver = riverCard != null
  // Voice state
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const stoppedRef = useRef(false)
  // We store the latest state in a ref so the voice callback always has the freshest value
  const stateRef = useRef(null)
  stateRef.current = state

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

  /* ---------- voice listening ---------- */
  const stopListening = useCallback(() => {
    stoppedRef.current = true
    setListening(false)
    setVoiceStatus('')
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const executeVoiceCommand = useCallback(async (cmd) => {
    if (!cmd) return
    const s = stateRef.current
    if (!s || s.current_actor == null) {
      setVoiceError('No player to act right now')
      return
    }
    const actor = s.current_actor
    const isHero = s.hero_seat != null && actor === s.hero_seat
    const cost = s.cost_to_call ?? 0

    let action = cmd.action
    let amount = 0

    if (action === 'fold') {
      amount = 0
    } else if (action === 'check') {
      if (cost > 0) {
        setVoiceError(`Cannot check — cost to call is ${formatMoney(cost)}`)
        return
      }
      amount = 0
    } else if (action === 'call') {
      amount = cmd.amount != null ? cmd.amount : cost
      if (amount <= 0) amount = cost  // "call" with no number means call the current bet
    } else if (action === 'raise') {
      amount = cmd.amount || 0.2
    } else if (action === 'allin') {
      action = 'raise'
      amount = 999  // large raise = all-in
    }

    setVoiceStatus(`Voice → Seat ${actor}: ${action.toUpperCase()} ${amount > 0 ? formatMoney(amount) : ''}`)

    const res = await tableAction(actor, action, amount, isHero)
    if (res && res.ok) {
      setState(res.state)
      setError(null)
    } else {
      setError(res?.error || 'Invalid action')
    }
  }, [])

  const startListening = useCallback(async () => {
    setTranscript('')
    setVoiceError('')
    setVoiceStatus('Starting mic…')
    stoppedRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setListening(true)
      setVoiceStatus('Listening…')

      const startChunk = () => {
        if (stoppedRef.current) return
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
        const mr = new MediaRecorder(stream, { mimeType })
        const chunks = []
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data)
        }
        mr.onstop = async () => {
          if (stoppedRef.current || chunks.length === 0) return
          const blob = new Blob(chunks, { type: mimeType })
          const kb = (blob.size / 1024).toFixed(1)
          setVoiceStatus(`Sending ${kb} KB…`)
          try {
            const result = await transcribeChunk(blob)
            if (stoppedRef.current) return
            if (result && result.ok && result.text) {
              setTranscript(prev => prev ? prev + ' ' + result.text : result.text)
              setVoiceStatus(`Heard: "${result.text}"`)

              const cmd = parseVoiceCommand(result.text)
              if (cmd) {
                setVoiceStatus(`Executing: ${cmd.action}${cmd.amount != null ? ' ' + cmd.amount : ''}`)
                await executeVoiceCommand(cmd)
                // Don't stop — keep listening for the next player
              } else {
                setVoiceStatus(`Heard: "${result.text}" (no command detected — say call/fold/raise/check)`)
              }
            } else if (result && !result.ok) {
              setVoiceError(result.error || 'Transcription failed')
              setVoiceStatus('Error — see below')
            } else {
              setVoiceStatus('Listening… (no speech detected)')
            }
          } catch (err) {
            if (!stoppedRef.current) {
              setVoiceError(err.message)
              setVoiceStatus('Error — see below')
            }
          }
        }
        mediaRecorderRef.current = mr
        mr.start()
        setTimeout(() => {
          if (mr.state === 'recording') mr.stop()
          if (!stoppedRef.current) startChunk()
        }, 3000)
      }

      startChunk()
    } catch (err) {
      setVoiceError('Mic access denied: ' + err.message)
      setListening(false)
    }
  }, [executeVoiceCommand])

  /* ---------- render ---------- */
  if (!state) {
    return (
      <div className="table-sim-view">
        <p className="table-sim-loading">Loading table…</p>
      </div>
    )
  }

  const n = state.num_players || 6
  const seatPositions = []
  // Distribute seats evenly around the rectangle perimeter, starting top-center clockwise
  const L = 5, R = 95, T = 8, B = 92
  const W = R - L       // 90
  const H = B - T       // 84
  const halfW = W / 2   // 45
  const perim = 2 * (W + H)  // 348

  for (let i = 0; i < n; i++) {
    const d = ((i / n) * perim) % perim
    let x, y

    if (d <= halfW) {
      // Top edge: center → right
      x = 50 + d
      y = T
    } else if (d <= halfW + H) {
      // Right edge: top → bottom
      x = R
      y = T + (d - halfW)
    } else if (d <= halfW + H + W) {
      // Bottom edge: right → left
      x = R - (d - halfW - H)
      y = B
    } else if (d <= halfW + H + W + H) {
      // Left edge: bottom → top
      x = L
      y = B - (d - halfW - H - W)
    } else {
      // Top edge: left → center
      x = L + (d - halfW - H - W - H)
      y = T
    }

    seatPositions.push({ seat: i, x, y })
  }

  return (
    <div className="table-sim-view">
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
            const oppCards = trainMode && opponentCards && opponentCards[String(seat)]
            const analysis = trainMode && playerAnalyses && playerAnalyses[String(seat)]

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
                {isHero && (
                  <div className="hero-hole-cards">
                    <div className="hero-hole-slots">
                      {[holeCards[0] || null, holeCards[1] || null].map((card, ci) => {
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
                {trainMode && oppCards && !isHero && inHand && (
                  <div className="opponent-hole-cards">
                    <div className="opponent-hole-slots">
                      {[oppCards[0] || null, oppCards[1] || null].map((card, ci) => {
                        const img = card ? getCardImage(card) : null
                        return (
                          <div key={ci} className={`opponent-hole-slot${img ? ' opponent-hole-slot--filled' : ''}`}>
                            {img && <img src={img} alt={card} className="opponent-hole-img" />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {trainMode && analysis && (
                  <div className="seat-recommendation">
                    <span className={`seat-rec-badge ${(analysis.recommendation || '').toLowerCase()}`}>
                      {analysis.recommendation || '—'}
                    </span>
                    {analysis.equity != null && (
                      <span className="seat-rec-equity">{Number(analysis.equity).toFixed(1)}%</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {currentActor != null && (
        <div className="actions-hud">
          {isMyTurn && canAct && (
            <div className="hud-row">
              {canCheck && (
                <button type="button" className="btn btn-action btn-check hud-btn" onClick={() => handleAction('check', 0, true)}>
                  Check
                </button>
              )}
              {costToCall > 0 && (
                <button type="button" className="btn btn-action btn-call hud-btn" onClick={() => handleAction('call', costToCall, true)}>
                  Call {formatMoney(costToCall)}
                </button>
              )}
              <button type="button" className="btn btn-action btn-fold hud-btn" onClick={() => handleAction('fold', 0, true)}>
                Fold
              </button>
              <button type="button" className="btn btn-action btn-raise hud-btn" onClick={() => handleAction('raise', raiseAmount, true)}>
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
              <span className="hud-seat-label">Seat {currentActor}</span>
              {canCheck && (
                <button type="button" className="btn btn-action btn-sim hud-btn" onClick={() => handleAction('check', 0, false)}>
                  Check
                </button>
              )}
              {costToCall > 0 && (
                <button type="button" className="btn btn-action btn-sim hud-btn" onClick={() => handleAction('call', costToCall, false)}>
                  Call {formatMoney(costToCall)}
                </button>
              )}
              <button type="button" className="btn btn-action btn-sim hud-btn" onClick={() => handleAction('fold', 0, false)}>
                Fold
              </button>
              <button type="button" className="btn btn-action btn-sim hud-btn" onClick={() => handleAction('raise', raiseAmount, false)}>
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

          <button
            type="button"
            className={`btn hud-btn ${listening ? 'btn-voice-stop' : 'btn-voice-listen'}`}
            onClick={listening ? stopListening : startListening}
          >
            {listening ? '⏹ Stop' : '🎤 Voice'}
          </button>

          {listening && (
            <div className="hud-voice-line">
              {voiceStatus || 'Listening…'}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
