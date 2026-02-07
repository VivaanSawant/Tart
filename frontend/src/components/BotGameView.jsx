import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { botAction, botFetchState, botNextHand, botStart, setBotAggression, fetchOpponentProfiles } from '../api/backend'
import { getCardImage } from '../utils/cardImages'
import useVoiceInput from '../hooks/useVoiceInput'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'

import './TableSimulator.css'

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '$0.00'
  return '$' + Number(val).toFixed(2)
}

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10]

export default function BotGameView({ playerProfile = null }) {
  const [state, setState] = useState(null)
  const [raiseAmount, setRaiseAmount] = useState(0.4)
  const [numPlayers, setNumPlayers] = useState(6)
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
  const lastBotAction = state?.last_bot_action ?? null

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

  // Stack tracking
  const playerStacks = state?.player_stacks ?? {}
  const allInPlayers = state?.all_in_players ?? []
  const heroStack = Number(playerStacks[String(heroSeat)] ?? 10)

  // Per-bot aggression from state + opponent profiles for dropdown
  const botAggression = state?.bot_aggression ?? {}
  const defaultAggression = state?.default_aggression ?? 'neutral'
  const [opponentProfiles, setOpponentProfiles] = useState({})

  // Fetch opponent profiles once (for the dropdown options)
  useEffect(() => {
    let mounted = true
    const load = async () => {
      const res = await fetchOpponentProfiles()
      if (res?.ok && mounted) setOpponentProfiles(res.opponents || {})
    }
    load()
    const interval = setInterval(load, 5000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const handleBotAggressionChange = useCallback(async (seat, value) => {
    await setBotAggression(seat, value)
  }, [])

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

  // Sync player count from server when we have state
  useEffect(() => {
    const n = state?.num_players
    if (n != null && n >= 2 && n <= 10) setNumPlayers(n)
  }, [state?.num_players])

  // Only auto-set raise when hand/street changes — not on every poll
  const lastAutoSetRef = useRef('')
  useEffect(() => {
    const key = `${state?.hand_number}_${street}`
    if (key === lastAutoSetRef.current) return
    lastAutoSetRef.current = key
    if (state?.pot && state.pot > 0) {
      const halfPot = Math.max(0.2, 0.5 * state.pot)
      setRaiseAmount(Math.min(halfPot, heroStack))
    }
  }, [state?.hand_number, street, state?.pot, heroStack])

  const handleAction = useCallback(async (action, amount = 0) => {
    const res = await botAction(action, amount)
    if (res && res.ok && res.state) {
      setState(res.state)
      setError(null)
    } else {
      setError(res?.error || 'Invalid action')
    }
  }, [])

  /* ---------- voice commands ---------- */
  const handleVoiceCommand = useCallback((cmd) => {
    // We read from the latest state values via the closure; useVoiceInput
    // calls onCommandRef.current so the latest handleVoiceCommand is always used.
    if (currentActor == null || currentActor !== heroSeat) {
      return // not hero's turn
    }
    let action = cmd.action
    let amount = 0
    if (action === 'fold') { amount = 0 }
    else if (action === 'check') {
      if (costToCall > 0) return // can't check
    } else if (action === 'call') {
      amount = cmd.amount != null ? cmd.amount : costToCall
      if (amount <= 0) amount = costToCall
    } else if (action === 'raise') {
      if (cmd.amount != null && cmd.amount > 0) { amount = cmd.amount }
      else return // couldn't parse raise amount
    } else if (action === 'allin') {
      action = 'raise'; amount = heroStack
    }
    handleAction(action, amount)
  }, [currentActor, heroSeat, costToCall, handleAction])

  const voice = useVoiceInput({ onCommand: handleVoiceCommand })

  const handleNextHand = useCallback(async () => {
    const res = await botNextHand()
    if (res?.ok && res.state) {
      setState(res.state)
      setError(null)
    }
  }, [])

  const handleNewGame = useCallback(async () => {
    const res = await botStart(numPlayers)
    if (res) {
      setState(res)
      setError(null)
    }
  }, [numPlayers])

  if (!state) {
    return (
      <Box className="table-sim-view" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 5, gap: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <CircularProgress size={24} />
          <Typography color="text.secondary">Loading bot game…</Typography>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" justifyContent="center">
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel id="bot-players-init-label">Players</InputLabel>
            <Select
              labelId="bot-players-init-label"
              value={numPlayers}
              label="Players"
              onChange={(e) => setNumPlayers(Number(e.target.value))}
            >
              {PLAYER_COUNT_OPTIONS.map((n) => (
                <MenuItem key={n} value={n}>{n}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" color="primary" onClick={handleNewGame}>
            Start new game
          </Button>
        </Stack>
      </Box>
    )
  }

  const n = state.num_players || 6
  const seatPositions = []
  const L = 5
  const R = 95
  const T = 2  /* Top-row seats (e.g. seat 0) sit higher so they don't cover pot text */
  const B = 92
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

  const opponentCount = state.players_in_hand?.filter((s) => s !== heroSeat).length ?? 0
  const showExploitPanel = opponentCount > 0 && !showdown

  return (
    <Box className="table-sim-view table-sim-view--bots" sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, overflow: 'auto' }}>
      {playerProfile && (
        <Card sx={{ mb: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Profile we&apos;re optimizing against
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Built from your Move Log. Bots use this to exploit your tendencies.
            </Typography>
            <Stack direction="row" flexWrap="wrap" spacing={2} sx={{ gap: 1.5 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Aggression</Typography>
                <Typography variant="body2" fontWeight={600}>{playerProfile.aggression}/100</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Optimal adherence</Typography>
                <Typography variant="body2" fontWeight={600}>{playerProfile.adherence}%</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Total moves</Typography>
                <Typography variant="body2" fontWeight={600}>{playerProfile.totalMoves}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Bluff condition</Typography>
                <Typography variant="body2" fontWeight={600}>Raise &gt;{playerProfile.bluffConditionPercent}% over suggested</Typography>
              </Box>
              {playerProfile.bluffCount > 0 && (
                <>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Bluffs detected</Typography>
                    <Typography variant="body2" fontWeight={600}>{playerProfile.bluffCount} ({playerProfile.bluffRate}% of raises)</Typography>
                  </Box>
                  {playerProfile.avgEquityWhenBluffing != null && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Avg equity when bluffing</Typography>
                      <Typography variant="body2" fontWeight={600}>{Number(playerProfile.avgEquityWhenBluffing).toFixed(1)}%</Typography>
                    </Box>
                  )}
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Bluffs by street</Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {['preflop', 'flop', 'turn', 'river'].filter((st) => (playerProfile.bluffByStreet[st] || 0) > 0).map((st) => (
                        <Chip key={st} label={`${st}: ${playerProfile.bluffByStreet[st]}`} size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'rgba(231,76,60,0.15)', color: '#e74c3c' }} />
                      ))}
                    </Stack>
                  </Box>
                </>
              )}
              <Box sx={{ width: '100%' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Action mix</Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {['call', 'raise', 'fold', 'check'].map((act) => (
                    <Chip key={act} label={`${act}: ${playerProfile.byAction[act] || 0}`} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                  ))}
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {showExploitPanel && (
        <Alert
          severity="warning"
          icon={<span style={{ fontSize: '1.2rem' }}>⚠</span>}
          sx={{
            mb: 2,
            '& .MuiAlert-message': { width: '100%' },
            bgcolor: 'rgba(255,152,0,0.08)',
            border: '1px solid',
            borderColor: 'warning.main',
          }}
        >
          <Typography component="span" fontWeight={700} sx={{ display: 'block', mb: 0.5 }}>
            Bots are playing to your weakness
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Opponents use inverse aggression — they exploit your tendency. Your moves are logged and reflected in their strategy.
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Exploit intensity
            </Typography>
            <Box
              sx={{
                height: 8,
                borderRadius: 1,
                bgcolor: 'action.hover',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  width: `${Math.min(100, (opponentCount / 6) * 60 + (state.pot || 0) * 8)}%`,
                  bgcolor: 'warning.main',
                  borderRadius: 1,
                  transition: 'width 0.3s ease',
                }}
              />
            </Box>
          </Box>
        </Alert>
      )}

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ position: 'relative', width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
              const stack = Number(playerStacks[String(seat)] ?? 10)
              const isAllIn = allInPlayers.includes(seat)

              return (
                <Paper
                  key={seat}
                  elevation={inHand && !showdown ? 2 : 0}
                  className={`seat seat-${seat} ${!inHand ? 'folded' : ''} ${isCurrent ? 'current' : ''} ${isHero ? 'hero' : ''}`}
                  style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                  sx={{
                    position: 'absolute',
                    borderRadius: 2,
                    p: 1,
                    minWidth: 70,
                    border: '2px solid',
                    borderColor: isCurrent ? '#3498db' : 'divider',
                    boxShadow: isCurrent ? '0 0 16px rgba(52,152,219,0.5)' : 'none',
                    opacity: !inHand ? 0.5 : 1,
                    bgcolor: !inHand ? '#1e1e1e' : 'background.paper',
                    zIndex: isHero ? 10 : 1,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <Stack spacing={0.5} alignItems="center">
                    <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" justifyContent="center">
                      <Typography variant="body2" fontWeight={600}>
                        Seat {seat}
                      </Typography>
                      {isHero && <Chip label="YOU" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />}
                      {!isHero && inHand && <Chip label="BOT" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#555', color: '#fff' }} />}
                    </Stack>
                    <Typography sx={{ fontSize: '0.75rem', color: stack <= 1 ? '#e74c3c' : '#2ecc71', fontWeight: 700 }}>
                      {formatMoney(stack)}
                    </Typography>
                    {!isHero && (
                      <Select
                        size="small"
                        value={botAggression[String(seat)] || 'default'}
                        onChange={(e) => handleBotAggressionChange(seat, e.target.value)}
                        sx={{
                          height: 22, fontSize: '0.68rem', minWidth: 80,
                          '& .MuiSelect-select': { py: 0, px: 0.75 },
                        }}
                      >
                        <MenuItem value="default" sx={{ fontSize: '0.75rem' }}>Default</MenuItem>
                        <MenuItem value="conservative" sx={{ fontSize: '0.75rem' }}>Conservative</MenuItem>
                        <MenuItem value="neutral" sx={{ fontSize: '0.75rem' }}>Neutral</MenuItem>
                        <MenuItem value="aggressive" sx={{ fontSize: '0.75rem' }}>Aggressive</MenuItem>
                        {Object.entries(opponentProfiles).map(([seatStr, opp]) => {
                          const p = opp.profile
                          if (!p || p.total_actions < 1) return null
                          return (
                            <MenuItem key={seatStr} value={p.aggression_level} sx={{ fontSize: '0.75rem' }}>
                              {opp.name} ({p.aggression})
                            </MenuItem>
                          )
                        })}
                      </Select>
                    )}
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="center">
                      {isDealer && <Chip label="D" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#3498db', color: '#fff' }} />}
                      {isSB && <Chip label="SB" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#9b59b6', color: '#fff' }} />}
                      {isBB && <Chip label="BB" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#e67e22', color: '#fff' }} />}
                      {isCurrent && !showdown && <Chip label="→" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#2ecc71', color: '#1a1a2e' }} />}
                      {isAllIn && !showdown && <Chip label="ALL-IN" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#e74c3c', color: '#fff', fontWeight: 700 }} />}
                      {showdown && showdown.winner_seat === seat && (
                        <Chip label="WIN" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#2ecc71', color: '#1a1a2e' }} />
                      )}
                    </Stack>
                    {bet > 0 && (
                      <Typography variant="body2" sx={{ color: '#f1c40f', fontWeight: 600 }}>
                        {formatMoney(bet)}
                      </Typography>
                    )}
                    {cardsForSeat && (
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                        {[cardsForSeat[0] || null, cardsForSeat[1] || null].map((card, ci) => {
                          const img = card ? getCardImage(card) : null
                          return (
                            <Box
                              key={ci}
                              sx={{
                                width: 59,
                                height: 84,
                                border: '2px solid',
                                borderColor: img ? 'transparent' : 'rgba(230,126,34,0.5)',
                                borderRadius: 1,
                                bgcolor: img ? 'transparent' : 'rgba(15,15,26,0.6)',
                                overflow: 'hidden',
                              }}
                            >
                              {img && <Box component="img" src={img} alt={card} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
                            </Box>
                          )
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              )
            })}
          </div>
        </div>
      </Box>

      {/* Betting controls — portalled into the header (#actions-hud-slot); centered, grayscale to match Game tab */}
      {showdown ? (() => {
        const slot = document.getElementById('actions-hud-slot')
        if (!slot) return null
        const btnSx = { bgcolor: '#555', color: '#fff', '&:hover': { bgcolor: '#666' } }
        return createPortal(
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {showdown.winner_seat != null ? (
                  <>Seat {showdown.winner_seat} wins {formatMoney(state.pot)}!</>
                ) : (
                  'Hand over'
                )}
              </Typography>
              <Button size="small" variant="contained" sx={btnSx} onClick={handleNextHand}>
                Next hand
              </Button>
              <Button
                size="small"
                variant="contained"
                sx={voice.listening ? { bgcolor: '#444', '&:hover': { bgcolor: '#555' } } : btnSx}
                startIcon={voice.listening ? <StopIcon /> : <MicIcon />}
                onClick={voice.listening ? voice.stopListening : voice.startListening}
              >
                {voice.listening ? 'Stop' : 'Voice'}
              </Button>
              {voice.listening && (
                <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {voice.voiceStatus || 'Listening…'}
                </Typography>
              )}
            </Stack>
          </Box>,
          slot
        )
      })() : currentActor != null && (() => {
        const slot = document.getElementById('actions-hud-slot')
        if (!slot) return null
        const btnSx = { bgcolor: '#555', color: '#fff', '&:hover': { bgcolor: '#666' } }
        return createPortal(
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'nowrap' }}>
              {isMyTurn && canAct ? (
                <>
                  {canCheck && (
                    <Button size="small" variant="contained" sx={btnSx} onClick={() => handleAction('check', 0)}>
                      Check
                    </Button>
                  )}
                  {costToCall > 0 && (
                    <Button size="small" variant="contained" sx={btnSx} onClick={() => handleAction('call', Math.min(costToCall, heroStack))}>
                      Call {formatMoney(Math.min(costToCall, heroStack))}
                    </Button>
                  )}
                  <Button size="small" variant="contained" sx={btnSx} onClick={() => handleAction('fold', 0)}>
                    Fold
                  </Button>
                  <Button size="small" variant="contained" sx={btnSx} onClick={() => handleAction('raise', Math.min(raiseAmount, heroStack))}>
                    {raiseAmount >= heroStack ? 'All-in' : 'Raise'}
                  </Button>
                  <TextField
                    type="number"
                    size="small"
                    inputProps={{ min: 0.01, step: 0.1, max: heroStack }}
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Math.min(Number(e.target.value) || 0.2, heroStack))}
                    sx={{ width: 72, '& .MuiInputBase-input': { py: 0.75, px: 1, fontSize: '0.875rem' } }}
                  />
                  <Typography variant="caption" sx={{ color: '#888', whiteSpace: 'nowrap' }}>{formatMoney(heroStack)}</Typography>
                </>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  {lastBotAction && (
                    <Typography variant="body2" color="text.secondary">
                      Seat {lastBotAction.seat}{' '}
                      {lastBotAction.action === 'check'
                        ? 'checked'
                        : lastBotAction.action === 'call'
                          ? `called ${formatMoney(lastBotAction.amount)}`
                          : lastBotAction.action === 'raise'
                            ? `raised ${formatMoney(lastBotAction.amount)}`
                            : lastBotAction.action === 'fold'
                              ? 'folded'
                              : lastBotAction.action}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Seat {currentActor} (bot) is acting…
                  </Typography>
                </Stack>
              )}
              <Button
                size="small"
                variant="contained"
                sx={voice.listening ? { bgcolor: '#444', '&:hover': { bgcolor: '#555' } } : btnSx}
                startIcon={voice.listening ? <StopIcon /> : <MicIcon />}
                onClick={voice.listening ? voice.stopListening : voice.startListening}
              >
                {voice.listening ? 'Stop' : 'Voice'}
              </Button>
              {voice.listening && (
                <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {voice.voiceStatus || 'Listening…'}
                </Typography>
              )}
            </Stack>
          </Box>,
          slot
        )
      })()}

      {/* New game + players — portalled into header right slot when Bots tab is active */}
      {(() => {
        const slot = document.getElementById('header-right-slot')
        if (!slot) return null
        return createPortal(
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel id="bot-players-label">Players</InputLabel>
              <Select
                labelId="bot-players-label"
                value={numPlayers}
                label="Players"
                onChange={(e) => setNumPlayers(Number(e.target.value))}
              >
                {PLAYER_COUNT_OPTIONS.map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" color="secondary" size="small" onClick={handleNewGame}>
              New game
            </Button>
          </Stack>,
          slot
        )
      })()}
    </Box>
  )
}
