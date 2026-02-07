import { useEffect, useState } from 'react'
import './App.css'

import {
  clearHand,
  confirmBetting,
  fetchState,
  setPlayStyle,
} from './api/backend'
import BettingModal from './components/BettingModal'
import CameraPermission from './components/CameraPermission'
import CameraSelector from './components/CameraSelector'
import EquityPanel from './components/EquityPanel'
import LandingPage from './components/LandingPage'
import PotOddsPanel from './components/PotOddsPanel'
import TableSimulatorView from './components/TableSimulatorView'
import VideoFeed from './components/VideoFeed'

const SMALL_BLIND = 0.1
const BIG_BLIND = 0.2
const BUY_IN = 10


function App() {
  const [showLanding, setShowLanding] = useState(true)
  const [gameState, setGameState] = useState({
    holeCards: [],
    availableCards: [],
    flopCards: [],
    turnCard: null,
    riverCard: null,
    equityFlop: null,
    equityTurn: null,
    equityRiver: null,
    equityPreflop: null,
    equityError: null,
    betRecommendations: null,
    pendingBettingStreet: null,
    potInfo: null,
    table: null,
    playStyle: 'neutral',
  })

  const handleFetchState = async () => {
    const data = await fetchState()
    if (!data) return
    setGameState({
      holeCards: data.hole_cards || [],
      availableCards: data.available_cards || [],
      flopCards: data.flop_cards || [],
      turnCard: data.turn_card || null,
      riverCard: data.river_card || null,
      equityPreflop: data.equity_preflop,
      equityFlop: data.equity_flop,
      equityTurn: data.equity_turn,
      equityRiver: data.equity_river,
      equityError: data.equity_error,
      betRecommendations: data.bet_recommendations || null,
      pendingBettingStreet: data.pending_betting_street || null,
      potInfo: data.pot || null,
      table: data.table || null,
      playStyle: data.play_style || 'neutral',
    })
  }

  useEffect(() => {
    handleFetchState()
    const interval = setInterval(handleFetchState, 500)
    return () => clearInterval(interval)
  }, [])


  const handleClear = async () => {
    const res = await clearHand()
    if (res && res.ok) {
      handleFetchState()
    }
  }

  const handleBettingSubmit = async (street, amount, isCall) => {
    const action = isCall ? (amount > 0 ? 'call' : 'check') : 'fold'
    const res = await confirmBetting(action, amount)
    if (res && res.ok) {
      handleFetchState()
    }
  }

  const handlePlayStyleChange = async (aggression) => {
    const res = await setPlayStyle(aggression)
    if (res && res.ok) {
      handleFetchState()
    }
  }

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />
  }

  return (
    <CameraPermission>
    <div className="app">
      <div className="video-pip">
        <CameraSelector />
        <VideoFeed src="/video_feed" />
      </div>

      <div className="table-hero">
        <TableSimulatorView
          holeCount={gameState.holeCards.length}
          flopCards={gameState.flopCards}
          turnCard={gameState.turnCard}
          riverCard={gameState.riverCard}
          potInfo={gameState.potInfo}
          equityPreflop={gameState.equityPreflop}
          equityFlop={gameState.equityFlop}
          equityTurn={gameState.equityTurn}
          equityRiver={gameState.equityRiver}
        />
      </div>

      <div className="below-fold">
        <div className="below-fold-content">
          <section className="play-style-section panel">
            <h2>Play style</h2>
            <p className="play-style-hint">Choose before each game. Affects call/raise equity thresholds.</p>
            <div className="play-style-buttons">
              <button
                type="button"
                className={`btn play-style-btn ${gameState.playStyle === 'conservative' ? 'active' : ''}`}
                onClick={() => handlePlayStyleChange('conservative')}
              >
                Conservative
              </button>
              <button
                type="button"
                className={`btn play-style-btn ${gameState.playStyle === 'neutral' ? 'active' : ''}`}
                onClick={() => handlePlayStyleChange('neutral')}
              >
                Neutral
              </button>
              <button
                type="button"
                className={`btn play-style-btn ${gameState.playStyle === 'aggressive' ? 'active' : ''}`}
                onClick={() => handlePlayStyleChange('aggressive')}
              >
                Aggressive
              </button>
            </div>
          </section>

          <div className="panel">
            <EquityPanel
              equityPreflop={gameState.equityPreflop}
              equityFlop={gameState.equityFlop}
              equityTurn={gameState.equityTurn}
              equityRiver={gameState.equityRiver}
              equityError={gameState.equityError}
              betRecommendations={gameState.betRecommendations}
              potInfo={gameState.potInfo}
              holeCount={gameState.holeCards.length}
              flopCount={gameState.flopCards.length}
              playersInHand={gameState.table?.players_in_hand?.length ?? 6}
            />
          </div>

          <div className="panel">
            <PotOddsPanel
              potInfo={gameState.potInfo}
              smallBlind={SMALL_BLIND}
              bigBlind={BIG_BLIND}
              buyIn={BUY_IN}
            />
          </div>

          <button type="button" className="btn btn-clear" onClick={handleClear}>
            Clear hand
          </button>
        </div>
      </div>
    </div>

    <BettingModal
      open={!!gameState.pendingBettingStreet}
      street={gameState.pendingBettingStreet}
      costToCall={gameState.potInfo?.to_call ?? 0}
      recommendation={
        gameState.betRecommendations?.[gameState.pendingBettingStreet] ?? null
      }
      onSubmit={handleBettingSubmit}
    />
    </CameraPermission>
  )
}

export default App
