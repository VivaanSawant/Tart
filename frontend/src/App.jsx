import { useEffect, useState } from 'react'
import './App.css'

import {
  clearHand,
  fetchState,
  lockHole,
  lockHoleAll,
  setPlayStyle,
} from './api/backend'
import CameraPermission from './components/CameraPermission'
import CameraSelector from './components/CameraSelector'
import CardsPanel from './components/CardsPanel'
import EquityPanel from './components/EquityPanel'
import PotOddsPanel from './components/PotOddsPanel'
import TableSimulatorView from './components/TableSimulatorView'
import VideoFeed from './components/VideoFeed'

const SMALL_BLIND = 0.1
const BIG_BLIND = 0.2
const BUY_IN = 10


function App() {
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


  const handleLockHole = async (card) => {
    const res = await lockHole(card)
    if (res && res.ok) {
      handleFetchState()
    }
  }

  const handleLockHoleAll = async () => {
    const res = await lockHoleAll()
    if (res && res.ok) {
      handleFetchState()
    }
  }

  const handleClear = async () => {
    const res = await clearHand()
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

  const canLockHole = gameState.holeCards.length < 2
  const holeHint = canLockHole
    ? 'Show your 2 hole cards to the camera, then click Lock hole.'
    : 'Hole full (2/2). Click a hole card to remove it, or Clear hand for new hand.'

  return (
    <CameraPermission>
    <div className="app">
      <header className="app-header">
        <h1>PokerPlaya</h1>
        <p className="subtitle">
          CV detects your cards and board. Table sim tracks flow and bets. Equity and recommendations
          use players still in hand.
        </p>
      </header>

      <div className="layout">
        <div className="main-area">
          <CameraSelector />
          <div className="video-wrap">
            <VideoFeed src="/video_feed" />
          </div>
          <TableSimulatorView
            holeCount={gameState.holeCards.length}
            flopCount={gameState.flopCards.length}
            hasTurn={gameState.turnCard != null}
            hasRiver={gameState.riverCard != null}
            potInfo={gameState.potInfo}
          />
          <CardsPanel
            holeCards={gameState.holeCards}
            availableCards={gameState.availableCards}
            flopCards={gameState.flopCards}
            turnCard={gameState.turnCard}
            riverCard={gameState.riverCard}
            canLockHole={canLockHole}
            holeHint={holeHint}
            onLockHole={handleLockHole}
            onLockHoleAll={handleLockHoleAll}
          />
        </div>

        <aside className="sidebar panel">
          <section className="play-style-section">
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

          <PotOddsPanel
            potInfo={gameState.potInfo}
            smallBlind={SMALL_BLIND}
            bigBlind={BIG_BLIND}
            buyIn={BUY_IN}
          />

          <button type="button" className="btn btn-clear" onClick={handleClear}>
            Clear hand
          </button>
        </aside>
      </div>
    </div>
    </CameraPermission>
  )
}

export default App
