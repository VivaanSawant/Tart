import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import CircularProgress from '@mui/material/CircularProgress'

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
  const callMatch = t.match(/\bcall(?:\s+(.+))?/)
  if (callMatch) {
    if (!callMatch[1]) return { action: 'call', amount: null }
    const rest = callMatch[1]
    const isCents = /\bcents?\b/.test(rest)
    const numPart = rest.replace(/\bcents?\b|\bdollars?\b/g, '').trim()
    let amount = spokenToNumber(numPart)
    if (amount != null && isCents) amount = amount / 100
    return { action: 'call', amount }
  }
  const raiseMatch = t.match(/\braise\s+(?:to\s+)?(.+)/)
  if (raiseMatch) {
    const rest = raiseMatch[1]
    const isCents = /\bcents?\b/.test(rest)
    const numPart = rest.replace(/\bcents?\b|\bdollars?\b/g, '').trim()
    let amount = spokenToNumber(numPart)
    if (amount != null && isCents) amount = amount / 100
    return { action: 'raise', amount }
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
}) {
  const [state, setState] = useState(null)
  const [raiseAmount, setRaiseAmount] = useState(0.4)
  const [numPlayers, setNumPlayers] = useState(6)
  const [error, setError] = useState(null)

  const flopCount = flopCards.length
  const hasTurn = turnCard != null
  const hasRiver = riverCard != null
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const stoppedRef = useRef(false)
  const stateRef = useRef(null)
  stateRef.current = state

  const heroSeat = state?.hero_seat ?? null
  const currentActor = state?.current_actor ?? null
  const isMyTurn = heroSeat != null && currentActor === heroSeat
  const street = state?.street ?? 'preflop'
  const hasCardsForStreet =
    state &&
    ((street === 'preflop' && holeCount >= 2) ||
      (street === 'flop' && holeCount >= 2 && flopCount >= 3) ||
      (street === 'turn' && holeCount >= 2 && flopCount >= 3) ||
      (street === 'river' && holeCount >= 2 && flopCount >= 3))
  const canAct = !!hasCardsForStreet
  const costToCall = state?.cost_to_call ?? 0
  const canCheck = costToCall <= 0

  const loadState = async () => {
    const data = await fetchTableState()
    if (data) { setState(data); setError(null) }
    else setError('Could not load table state')
  }

  useEffect(() => {
    loadState()
    const interval = setInterval(loadState, 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (potInfo?.recommendation !== 'raise') return
    const suggested = potInfo?.suggested_raise
    if (suggested != null) {
      const val = Number(suggested)
      if (!Number.isNaN(val) && val > 0) setRaiseAmount(val)
      return
    }
    const potBefore = potInfo?.pot_before_call
    const toCall = potInfo?.to_call ?? 0
    if (potBefore != null && Number(potBefore) > 0) {
      setRaiseAmount(Math.max(0.2, 0.5 * Number(potBefore)))
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
            handNumber: state.hand_number, street, action, amount,
            equity: equityForStreet,
            optimalMove: potInfo?.recommendation ?? 'no_bet',
            suggestedRaise: potInfo?.suggested_raise,
            pot: state.pot, toCall: potInfo?.to_call,
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
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const action = HERO_KEYS[parseInt(e.key, 10)]
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
    if (res && res.ok) { setState(res.state); setError(null) }
    else setError('Could not reset')
  }

  const handleSetHero = useCallback(async (seat) => {
    const res = await tableSetHero(seat)
    if (res && res.ok) { setState(res.state); setError(null) }
    else setError(res?.error || 'Could not set hero')
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

  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  const executeVoiceCommand = useCallback(async (cmd) => {
    if (!cmd) return
    const s = stateRef.current
    if (!s || s.current_actor == null) { setVoiceError('No player to act right now'); return }
    const actor = s.current_actor
    const isHero = s.hero_seat != null && actor === s.hero_seat
    const cost = s.cost_to_call ?? 0
    let action = cmd.action
    let amount = 0
    if (action === 'fold') { amount = 0 }
    else if (action === 'check') {
      if (cost > 0) { setVoiceError(`Cannot check — cost to call is ${formatMoney(cost)}`); return }
    } else if (action === 'call') {
      amount = cmd.amount != null ? cmd.amount : cost
      if (amount <= 0) amount = cost
    } else if (action === 'raise') { amount = cmd.amount || 0.2 }
    else if (action === 'allin') { action = 'raise'; amount = 999 }
    setVoiceStatus(`Voice → Seat ${actor}: ${action.toUpperCase()} ${amount > 0 ? formatMoney(amount) : ''}`)
    const res = await tableAction(actor, action, amount, isHero)
    if (res && res.ok) { setState(res.state); setError(null) }
    else setError(res?.error || 'Invalid action')
  }, [])

  const startListening = useCallback(async () => {
    setTranscript(''); setVoiceError(''); setVoiceStatus('Starting mic…'); stoppedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream; setListening(true); setVoiceStatus('Listening…')
      const startChunk = () => {
        if (stoppedRef.current) return
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
        const mr = new MediaRecorder(stream, { mimeType })
        const chunks = []
        mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
        mr.onstop = async () => {
          if (stoppedRef.current || chunks.length === 0) return
          const blob = new Blob(chunks, { type: mimeType })
          setVoiceStatus(`Sending ${(blob.size / 1024).toFixed(1)} KB…`)
          try {
            const result = await transcribeChunk(blob)
            if (stoppedRef.current) return
            if (result && result.ok && result.text) {
              setTranscript(prev => prev ? prev + ' ' + result.text : result.text)
              setVoiceStatus(`Heard: "${result.text}"`)
              const cmd = parseVoiceCommand(result.text)
              if (cmd) { setVoiceStatus(`Executing: ${cmd.action}${cmd.amount != null ? ' ' + cmd.amount : ''}`); await executeVoiceCommand(cmd) }
              else setVoiceStatus(`Heard: "${result.text}" (no command detected — say call/fold/raise/check)`)
            } else if (result && !result.ok) { setVoiceError(result.error || 'Transcription failed'); setVoiceStatus('Error — see below') }
            else setVoiceStatus('Listening… (no speech detected)')
          } catch (err) { if (!stoppedRef.current) { setVoiceError(err.message); setVoiceStatus('Error — see below') } }
        }
        mediaRecorderRef.current = mr; mr.start()
        setTimeout(() => { if (mr.state === 'recording') mr.stop(); if (!stoppedRef.current) startChunk() }, 3000)
      }
      startChunk()
    } catch (err) { setVoiceError('Mic access denied: ' + err.message); setListening(false) }
  }, [executeVoiceCommand])

  /* ---------- render ---------- */
  if (!state) {
    return (
      <Box className="table-sim-view" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  const n = state.num_players || 6
  const seatPositions = []
  const L = 5, R = 95, T = 8, B = 92
  const W = R - L, H = B - T, halfW = W / 2
  const perim = 2 * (W + H)

  for (let i = 0; i < n; i++) {
    const d = ((i / n) * perim) % perim
    let x, y
    if (d <= halfW) { x = 50 + d; y = T }
    else if (d <= halfW + H) { x = R; y = T + (d - halfW) }
    else if (d <= halfW + H + W) { x = R - (d - halfW - H); y = B }
    else if (d <= halfW + H + W + H) { x = L; y = B - (d - halfW - H - W) }
    else { x = L + (d - halfW - H - W - H); y = T }
    seatPositions.push({ seat: i, x, y })
  }

  return (
    <Box className="table-sim-view" sx={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <div className="table-container">
        <div className="table-felt">
          <div className="table-center">
            <div className="table-info-row">
              <div className="table-pot">Pot {formatMoney(state.pot)}</div>
              {(() => {
                const eq = hasRiver ? equityRiver : hasTurn ? equityTurn : flopCount >= 3 ? equityFlop : holeCount >= 2 ? equityPreflop : null
                if (eq == null) return null
                const pct = Number(eq)
                if (Number.isNaN(pct)) return null
                const color = pct >= 65 ? '#2ecc71' : pct >= 45 ? '#f1c40f' : '#e74c3c'
                return <div className="table-equity" style={{ color }}>Equity: {pct.toFixed(1)}%</div>
              })()}
            </div>
            <div className="table-board">
              {[flopCards[0] || null, flopCards[1] || null, flopCards[2] || null, turnCard, riverCard].map((card, i) => {
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
              <Paper
                key={seat}
                className={`seat seat-${seat} ${!inHand ? 'folded' : ''} ${isCurrent ? 'current' : ''} ${isHero ? 'hero' : ''}`}
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                sx={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 70, p: '10px 14px' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#eee', fontSize: '0.95rem' }}>
                  Seat {seat}
                  {isHero && <Chip label="YOU" size="small" color="success" sx={{ ml: 0.5, height: 18, fontSize: '0.7rem' }} />}
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                  {isDealer && <Chip label="D" size="small" sx={{ bgcolor: '#3498db', color: '#fff', height: 20, fontSize: '0.7rem' }} />}
                  {isSB && <Chip label="SB" size="small" sx={{ bgcolor: '#9b59b6', color: '#fff', height: 20, fontSize: '0.7rem' }} />}
                  {isBB && <Chip label="BB" size="small" sx={{ bgcolor: '#e67e22', color: '#fff', height: 20, fontSize: '0.7rem' }} />}
                  {isCurrent && <Chip label="→" size="small" sx={{ bgcolor: '#2ecc71', color: '#1a1a2e', height: 20, fontSize: '0.7rem' }} />}
                </Stack>
                {bet > 0 && <Typography sx={{ fontSize: '0.8rem', color: '#f1c40f', mt: 0.5 }}>{formatMoney(bet)}</Typography>}
                {heroSeat == null && (
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    onClick={(e) => { e.stopPropagation(); handleSetHero(seat) }}
                    sx={{ mt: 1, fontSize: '0.75rem', py: 0.25, px: 1 }}
                  >
                    I&apos;m Hero
                  </Button>
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
              </Paper>
            )
          })}
        </div>
      </div>

      {/* Actions HUD — portalled into the nav bar slot */}
      {currentActor != null && (() => {
        const slot = document.getElementById('actions-hud-slot')
        if (!slot) return null
        return createPortal(
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'nowrap' }}>
            {isMyTurn && canAct ? (
              <>
                {canCheck && (
                  <Button size="small" variant="contained" sx={{ bgcolor: '#3498db', '&:hover': { bgcolor: '#2980b9' } }} onClick={() => handleAction('check', 0, true)}>
                    Check
                  </Button>
                )}
                {costToCall > 0 && (
                  <Button size="small" variant="contained" color="success" onClick={() => handleAction('call', costToCall, true)}>
                    Call {formatMoney(costToCall)}
                  </Button>
                )}
                <Button size="small" variant="contained" color="error" onClick={() => handleAction('fold', 0, true)}>
                  Fold
                </Button>
                <Button size="small" variant="contained" sx={{ bgcolor: '#f1c40f', color: '#1a1a2e', '&:hover': { bgcolor: '#f39c12' } }} onClick={() => handleAction('raise', raiseAmount, true)}>
                  Raise
                </Button>
                <TextField
                  type="number"
                  size="small"
                  inputProps={{ min: 0.01, step: 0.1 }}
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value) || 0.2)}
                  sx={{ width: 68, '& input': { py: 0.5, px: 0.75, fontSize: '0.78rem' } }}
                />
              </>
            ) : (
              <>
                <Typography variant="caption" sx={{ mr: 0.25, whiteSpace: 'nowrap' }}>Seat {currentActor}</Typography>
                {canCheck && (
                  <Button size="small" variant="contained" sx={{ bgcolor: '#555', '&:hover': { bgcolor: '#666' } }} onClick={() => handleAction('check', 0, false)}>
                    Check
                  </Button>
                )}
                {costToCall > 0 && (
                  <Button size="small" variant="contained" sx={{ bgcolor: '#555', '&:hover': { bgcolor: '#666' } }} onClick={() => handleAction('call', costToCall, false)}>
                    Call {formatMoney(costToCall)}
                  </Button>
                )}
                <Button size="small" variant="contained" sx={{ bgcolor: '#555', '&:hover': { bgcolor: '#666' } }} onClick={() => handleAction('fold', 0, false)}>
                  Fold
                </Button>
                <Button size="small" variant="contained" sx={{ bgcolor: '#555', '&:hover': { bgcolor: '#666' } }} onClick={() => handleAction('raise', raiseAmount, false)}>
                  Raise
                </Button>
                <TextField
                  type="number"
                  size="small"
                  inputProps={{ min: 0.01, step: 0.1 }}
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value) || 0.2)}
                  sx={{ width: 68, '& input': { py: 0.5, px: 0.75, fontSize: '0.78rem' } }}
                />
              </>
            )}
            <Button
              size="small"
              variant="contained"
              color={listening ? 'error' : 'success'}
              startIcon={listening ? <StopIcon /> : <MicIcon />}
              onClick={listening ? stopListening : startListening}
              sx={listening ? { animation: 'pulse-red 1.2s ease-in-out infinite' } : {}}
            >
              {listening ? 'Stop' : 'Voice'}
            </Button>
            {listening && (
              <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                {voiceStatus || 'Listening…'}
              </Typography>
            )}
          </Stack>,
          slot
        )
      })()}
    </Box>
  )
}
