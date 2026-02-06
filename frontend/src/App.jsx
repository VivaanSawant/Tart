import { useEffect, useRef, useState } from 'react'
import './App.css'

import {
  clearHand,
  confirmBetting,
  fetchState,
  lockHole,
  lockHoleAll,
  updatePotState,
} from './api/backend'
import BettingModal from './components/BettingModal'
import CardsPanel from './components/CardsPanel'
import EquityPanel from './components/EquityPanel'
import PotOddsPanel from './components/PotOddsPanel'
import VideoFeed from './components/VideoFeed'

const EMPTY_POT = {
  starting_pot: 1.5,
  current_street: 'flop',
  preflop: { opponent: 0, hero: 0 },
  flop: { opponent: 0, hero: 0 },
  turn: { opponent: 0, hero: 0 },
  river: { opponent: 0, hero: 0 },
}

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
    equityError: null,
    pendingBettingStreet: null,
    potInfo: null,
  })
  const [potInputs, setPotInputs] = useState(EMPTY_POT)
  const potPushTimeout = useRef(null)

  const schedulePotPush = (nextState) => {
    if (potPushTimeout.current) {
      clearTimeout(potPushTimeout.current)
    }
    potPushTimeout.current = setTimeout(() => {
      updatePotState({
        starting_pot: Number(nextState.starting_pot) || 0,
        current_street: nextState.current_street,
        preflop: nextState.preflop,
        flop: nextState.flop,
        turn: nextState.turn,
        river: nextState.river,
      })
    }, 400)
  }

  const handleFetchState = async () => {
    const data = await fetchState()
    if (!data) return
    setGameState({
      holeCards: data.hole_cards || [],
      availableCards: data.available_cards || [],
      flopCards: data.flop_cards || [],
      turnCard: data.turn_card || null,
      riverCard: data.river_card || null,
      equityFlop: data.equity_flop,
      equityTurn: data.equity_turn,
      equityRiver: data.equity_river,
      equityError: data.equity_error,
      pendingBettingStreet: data.pending_betting_street || null,
      potInfo: data.pot || null,
    })
    if (data.pot && data.pot.state) {
      setPotInputs({
        starting_pot: data.pot.state.starting_pot ?? 1.5,
        current_street: data.pot.current_street || 'flop',
        preflop: data.pot.state.preflop || { opponent: 0, hero: 0 },
        flop: data.pot.state.flop || { opponent: 0, hero: 0 },
        turn: data.pot.state.turn || { opponent: 0, hero: 0 },
        river: data.pot.state.river || { opponent: 0, hero: 0 },
      })
    }
  }

  useEffect(() => {
    handleFetchState()
    const interval = setInterval(handleFetchState, 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const initialPush = setTimeout(() => {
      updatePotState({
        starting_pot: Number(potInputs.starting_pot) || 0,
        current_street: potInputs.current_street,
        preflop: potInputs.preflop,
        flop: potInputs.flop,
        turn: potInputs.turn,
        river: potInputs.river,
      })
    }, 300)
    return () => clearTimeout(initialPush)
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

  const handleConfirmBetting = async (street, opponent, hero) => {
    const res = await confirmBetting(street, opponent, hero)
    if (res && res.ok) {
      setPotInputs((prev) => {
        const next = {
          ...prev,
          [street]: { opponent, hero },
        }
        schedulePotPush(next)
        return next
      })
      handleFetchState()
    }
  }

  const updateStartingPot = (value) => {
    setPotInputs((prev) => {
      const next = { ...prev, starting_pot: Number(value) || 0 }
      schedulePotPush(next)
      return next
    })
  }

  const updateStreet = (value) => {
    setPotInputs((prev) => {
      const next = { ...prev, current_street: value }
      schedulePotPush(next)
      return next
    })
  }

  const updateBet = (street, side, value) => {
    setPotInputs((prev) => {
      const next = {
        ...prev,
        [street]: {
          ...prev[street],
          [side]: Number(value) || 0,
        },
      }
      schedulePotPush(next)
      return next
    })
  }

  const canLockHole = gameState.holeCards.length < 2
  const holeHint = canLockHole
    ? 'Show your 2 hole cards to the camera, then click Lock hole.'
    : 'Hole full (2/2). Click a hole card to remove it, or Clear hand for new hand.'

  return (
    <div className="app">
      <h1>PokerPlaya – Card Lock</h1>
      <p className="subtitle">
        One-click lock hole, then flop and turn (and river) auto-detect after 2 seconds stable.
      </p>

      <BettingModal
        open={Boolean(gameState.pendingBettingStreet)}
        street={gameState.pendingBettingStreet}
        defaultOpponent={
          gameState.pendingBettingStreet
            ? potInputs[gameState.pendingBettingStreet]?.opponent
            : 0
        }
        defaultHero={
          gameState.pendingBettingStreet
            ? potInputs[gameState.pendingBettingStreet]?.hero
            : 0
        }
        onSubmit={handleConfirmBetting}
      />

      <div className="layout">
        <VideoFeed src="/video_feed" />

        <div className="panel">
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

          <PotOddsPanel
            potInputs={potInputs}
            potInfo={gameState.potInfo}
            onStartingPotChange={updateStartingPot}
            onStreetChange={updateStreet}
            onBetChange={updateBet}
          />

          <EquityPanel
            equityFlop={gameState.equityFlop}
            equityTurn={gameState.equityTurn}
            equityRiver={gameState.equityRiver}
            equityError={gameState.equityError}
            holeCount={gameState.holeCards.length}
            flopCount={gameState.flopCards.length}
          />

          <button type="button" className="btn" id="clear-btn" onClick={handleClear}>
            Clear hand (full restart)
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
