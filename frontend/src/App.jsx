import { useCallback, useEffect, useState } from 'react'
import './App.css'

import {
  clearHand,
  fetchState,
  setPlayStyle,
  tableReset,
} from './api/backend'
import CameraPermission from './components/CameraPermission'
import CameraSelector from './components/CameraSelector'
import EquityPanel from './components/EquityPanel'
import LandingPage from './components/LandingPage'
import MoveLog from './components/MoveLog'
import PotOddsPanel from './components/PotOddsPanel'
import TableSimulatorView from './components/TableSimulatorView'
import VideoFeed from './components/VideoFeed'

const SMALL_BLIND = 0.1
const BIG_BLIND = 0.2
const BUY_IN = 10


function App() {
  const [showLanding, setShowLanding] = useState(true)
  const [activeTab, setActiveTab] = useState('game')
  const [moveLog, setMoveLog] = useState([])
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
    trainOpponentCards: null,
    trainPlayerAnalyses: null,
  })

  const handleFetchState = async () => {
    const train = activeTab === 'train'
    const data = await fetchState({
      train,
      ...(train && { heroAggression }),
    })
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
      trainOpponentCards: data.train_opponent_cards || null,
      trainPlayerAnalyses: data.train_player_analyses || null,
    })
  }

  useEffect(() => {
    handleFetchState()
    const interval = setInterval(handleFetchState, 500)
    return () => clearInterval(interval)
  }, [activeTab])


  const handleClear = async () => {
    const res = await clearHand()
    if (res && res.ok) {
      handleFetchState()
    }
  }

  const handleNewTable = async () => {
    const res = await tableReset()
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

  const handleHeroMove = useCallback((move) => {
    setMoveLog((prev) => [...prev, { ...move, timestamp: Date.now() }])
  }, [])

  // Aggression factor 0–100 from move log (same formula as MoveLog). Default 25 when no moves (for Train mode opponents).
  const heroAggression = (() => {
    if (moveLog.length === 0) return 25
    const total = moveLog.length
    const totalRaises = moveLog.filter((m) => (m.action || '').toLowerCase() === 'raise').length
    const totalCalls = moveLog.filter((m) => (m.action || '').toLowerCase() === 'call').length
    return Math.round(((totalRaises + totalCalls * 0.5) / total) * 100)
  })()

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />
  }

  return (
    <CameraPermission>
    <div className="app">
      <nav className="app-nav">
        <button
          type="button"
          className={`nav-tab ${activeTab === 'train' ? 'active' : ''}`}
          onClick={() => setActiveTab('train')}
        >
          Train Yourself
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'game' ? 'active' : ''}`}
          onClick={() => setActiveTab('game')}
        >
          Game
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Info
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'movelog' ? 'active' : ''}`}
          onClick={() => setActiveTab('movelog')}
        >
          Move Log
        </button>
        <button type="button" className="btn btn-clear nav-right-btn" style={{ marginLeft: 'auto' }} onClick={handleClear}>
          Clear hand
        </button>
        <button type="button" className="btn btn-reset nav-right-btn" onClick={handleNewTable}>
          New table
        </button>
      </nav>

      {activeTab === 'info' ? (
        <div className="info-tab">
          <div className="info-tab-content">
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
          </div>
        </div>
      ) : activeTab === 'movelog' ? (
        <div className="info-tab">
          <MoveLog moves={moveLog} />
        </div>
      ) : (
        <div className="table-hero">
          <TableSimulatorView
            holeCards={gameState.holeCards}
            holeCount={gameState.holeCards.length}
            flopCards={gameState.flopCards}
            turnCard={gameState.turnCard}
            riverCard={gameState.riverCard}
            potInfo={gameState.potInfo}
            equityPreflop={gameState.equityPreflop}
            equityFlop={gameState.equityFlop}
            equityTurn={gameState.equityTurn}
            equityRiver={gameState.equityRiver}
            onHeroMove={activeTab === 'train' ? undefined : handleHeroMove}
            trainMode={activeTab === 'train'}
            opponentCards={gameState.trainOpponentCards}
            playerAnalyses={gameState.trainPlayerAnalyses}
          />
        </div>
      )}

      <div className="bottom-bar">
        <div className="bottom-bar-spacer" />
        <div className="video-section">
          <CameraSelector />
          <VideoFeed src="/video_feed" />
        </div>
      </div>
    </div>
    </CameraPermission>
  )
}

export default App
