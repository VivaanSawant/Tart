import { useCallback, useEffect, useRef, useState } from 'react'
import {
  botAct,
  endBotMatch,
  fetchState,
  fetchTableState,
  startBotMatch,
} from '../api/backend'
import { computePlayerAggression } from '../utils/moveLogStats'
import CameraPermission from './CameraPermission'
import CameraSelector from './CameraSelector'
import EquityPanel from './EquityPanel'
import PotOddsPanel from './PotOddsPanel'
import TableSimulatorView from './TableSimulatorView'
import VideoFeed from './VideoFeed'
import './BotMatchView.css'

const MIN_MOVES_TO_UNLOCK = 4
const SMALL_BLIND = 0.1
const BIG_BLIND = 0.2
const BUY_IN = 10

export default function BotMatchView({
  moveLog = [],
  gameState,
  onFetchState,
  onHeroMove,
  onPlayStyleChange,
  onClear,
}) {
  const [tableState, setTableState] = useState(null)
  const [botMatchActive, setBotMatchActive] = useState(false)
  const [pickError, setPickError] = useState(null)
  const lastBotActRef = useRef({ hand: -1, actor: -1 })
  const BOT_ACT_DELAY_MS = 0

  const playerAggression = computePlayerAggression(moveLog)
  const canUnlock = moveLog.length >= MIN_MOVES_TO_UNLOCK
  const isBotMatchActive = botMatchActive || gameState?.table?.bot_mode === true

  const loadTableState = useCallback(async () => {
    const data = await fetchTableState()
    if (data) setTableState(data)
  }, [])

  useEffect(() => {
    loadTableState()
    const interval = setInterval(loadTableState, 400)
    return () => clearInterval(interval)
  }, [loadTableState])

  useEffect(() => {
    if (gameState?.table?.bot_mode === true) setBotMatchActive(true)
  }, [gameState?.table?.bot_mode])

  useEffect(() => {
    if (!isBotMatchActive) return
    const t = gameState?.table || tableState
    if (!t) return
    const actor = t.current_actor
    const heroSeat = t.hero_seat
    const hand = t.hand_number ?? 0
    if (actor == null || actor === heroSeat) return
    if (!t.players_in_hand?.includes(actor)) return
    const key = `${hand}-${actor}`
    const lastKey = `${lastBotActRef.current.hand}-${lastBotActRef.current.actor}`
    if (key === lastKey) return
    lastBotActRef.current = { hand, actor }
    const timer = setTimeout(() => {
      botAct().then((res) => {
        if (res?.ok && res.state) {
          setTableState(res.state)
          onFetchState?.()
        }
      })
    }, BOT_ACT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isBotMatchActive, gameState?.table, tableState, onFetchState])

  const handlePickSeat = useCallback(
    async (seat) => {
      setPickError(null)
      const res = await startBotMatch(seat, playerAggression)
      if (res?.ok) {
        setTableState(res.state)
        setBotMatchActive(true)
        lastBotActRef.current = { hand: -1, actor: -1 }
        onFetchState?.()
      } else {
        setPickError(res?.error || 'Failed to start bot match')
      }
    },
    [playerAggression, onFetchState]
  )

  const handleEndBotMatch = useCallback(async () => {
    const res = await endBotMatch()
    if (res?.ok) {
      setTableState(res.state)
      setBotMatchActive(false)
      onFetchState?.()
    }
  }, [onFetchState])

  if (!canUnlock) {
    return (
      <div className="bot-match-view">
        <div className="bot-match-gate">
          <div className="bot-match-gate-icon">🔒</div>
          <h2>Bot Match Locked</h2>
          <p>
            Play at least {MIN_MOVES_TO_UNLOCK} hands in the main game and log your moves in the Move Log
            to unlock VS Bots. Your opponents will play with aggression inverse to your profile.
          </p>
          <p className="bot-match-gate-progress">
            {moveLog.length} / {MIN_MOVES_TO_UNLOCK} moves logged
          </p>
        </div>
      </div>
    )
  }

  if (!isBotMatchActive) {
    return (
      <div className="bot-match-view">
        <div className="bot-match-seat-picker">
          <h2>Pick Your Seat</h2>
          <p className="bot-match-seat-hint">
            Choose your seat. Bots (inverse aggression: {100 - playerAggression}) will auto-play all other seats.
          </p>
          <div className="bot-match-seat-grid">
            {[0, 1, 2, 3, 4, 5].map((seat) => (
              <button
                key={seat}
                type="button"
                className="btn bot-seat-btn"
                onClick={() => handlePickSeat(seat)}
              >
                Seat {seat}
              </button>
            ))}
          </div>
          {pickError && <p className="bot-match-pick-error">{pickError}</p>}
        </div>
      </div>
    )
  }

  return (
    <CameraPermission>
      <div className="bot-match-view bot-match-active">
        <div className="bot-match-header">
          <span className="bot-match-badge">VS Bots</span>
          <span className="bot-match-aggression">
            Your aggression: {playerAggression} → Bots: {100 - playerAggression}
          </span>
          <button type="button" className="btn btn-end-bot" onClick={handleEndBotMatch}>
            End Bot Match
          </button>
        </div>

        <div className="video-pip bot-video-pip">
          <CameraSelector />
          <VideoFeed src="/video_feed" />
        </div>

        <div className="table-hero">
          <TableSimulatorView
            holeCards={gameState?.holeCards ?? []}
            holeCount={gameState?.holeCards?.length ?? 0}
            flopCards={gameState?.flopCards ?? []}
            turnCard={gameState?.turnCard}
            riverCard={gameState?.riverCard}
            potInfo={gameState?.potInfo}
            equityPreflop={gameState?.equityPreflop}
            equityFlop={gameState?.equityFlop}
            equityTurn={gameState?.equityTurn}
            equityRiver={gameState?.equityRiver}
            onHeroMove={undefined}
            botMode
          />
        </div>

        <div className="below-fold">
          <div className="below-fold-content">
            <section className="play-style-section panel">
              <h2>Play style</h2>
              <div className="play-style-buttons">
                <button
                  type="button"
                  className={`btn play-style-btn ${gameState?.playStyle === 'conservative' ? 'active' : ''}`}
                  onClick={() => onPlayStyleChange?.('conservative')}
                >
                  Conservative
                </button>
                <button
                  type="button"
                  className={`btn play-style-btn ${gameState?.playStyle === 'neutral' ? 'active' : ''}`}
                  onClick={() => onPlayStyleChange?.('neutral')}
                >
                  Neutral
                </button>
                <button
                  type="button"
                  className={`btn play-style-btn ${gameState?.playStyle === 'aggressive' ? 'active' : ''}`}
                  onClick={() => onPlayStyleChange?.('aggressive')}
                >
                  Aggressive
                </button>
              </div>
            </section>

            <div className="panel">
              <EquityPanel
                equityPreflop={gameState?.equityPreflop}
                equityFlop={gameState?.equityFlop}
                equityTurn={gameState?.equityTurn}
                equityRiver={gameState?.equityRiver}
                equityError={gameState?.equityError}
                betRecommendations={gameState?.betRecommendations}
                potInfo={gameState?.potInfo}
                holeCount={gameState?.holeCards?.length ?? 0}
                flopCount={gameState?.flopCards?.length ?? 0}
                playersInHand={gameState?.table?.players_in_hand?.length ?? 6}
              />
            </div>

            <div className="panel">
              <PotOddsPanel
                potInfo={gameState?.potInfo}
                smallBlind={SMALL_BLIND}
                bigBlind={BIG_BLIND}
                buyIn={BUY_IN}
              />
            </div>

            <button type="button" className="btn btn-clear" onClick={onClear}>
              Clear hand
            </button>
          </div>
        </div>
      </div>
    </CameraPermission>
  )
}
