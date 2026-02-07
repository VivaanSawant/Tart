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

const SMALL_BLIND = 0.1
const BIG_BLIND = 0.2
const BUY_IN = 10

const EMPTY_POT = {
  starting_pot: SMALL_BLIND + BIG_BLIND,
  small_blind: SMALL_BLIND,
  big_blind: BIG_BLIND,
  buy_in: BUY_IN,
  current_street: 'flop',
  preflop: { opponent: BIG_BLIND, hero: 0 },
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
    equityPreflop: null,
    equityError: null,
    betRecommendations: null,
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
      equityPreflop: data.equity_preflop,
      equityFlop: data.equity_flop,
      equityTurn: data.equity_turn,
      equityRiver: data.equity_river,
      equityError: data.equity_error,
      betRecommendations: data.bet_recommendations || null,
      pendingBettingStreet: data.pending_betting_street || null,
      potInfo: data.pot || null,
    })
    if (data.pot && data.pot.state) {
      const pendingStreet = data.pending_betting_street || null
      setPotInputs((prev) => {
        const next = {
          starting_pot: data.pot.state.starting_pot ?? EMPTY_POT.starting_pot,
          current_street: data.pot.current_street || 'flop',
          preflop: data.pot.state.preflop || EMPTY_POT.preflop,
          flop: data.pot.state.flop || { opponent: 0, hero: 0 },
          turn: data.pot.state.turn || { opponent: 0, hero: 0 },
          river: data.pot.state.river || { opponent: 0, hero: 0 },
        }
        if (pendingStreet) {
          next[pendingStreet] = prev[pendingStreet] ?? next[pendingStreet]
        }
        return next
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

  const handleConfirmBetting = async (street, costToCall, didCall) => {
    if (!didCall) {
      // Fold: clear all cards and pot, start tracking again
      const res = await clearHand()
      if (res && res.ok) {
        setPotInputs(EMPTY_POT)
        handleFetchState()
      }
      return
    }
    const opponent = costToCall
    const hero = costToCall
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

  const handleModalCostToCallChange = (street, value) => {
    const cost = Number(value) || 0
    setPotInputs((prev) => {
      const next = {
        ...prev,
        [street]: { opponent: cost, hero: 0 },
        current_street: street,
      }
      schedulePotPush(next)
      return next
    })
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

  const updateCostToCall = (street, value) => {
    const cost = Number(value) || 0
    setPotInputs((prev) => {
      const next = {
        ...prev,
        [street]: { opponent: cost, hero: 0 },
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
      <header className="app-header">
        <h1>PokerPlaya</h1>
        <p className="subtitle">
          Lock hole cards, then flop / turn / river auto-detect. Win probability + bet advice below.
        </p>
      </header>

      <BettingModal
        open={Boolean(gameState.pendingBettingStreet)}
        street={gameState.pendingBettingStreet}
        defaultCostToCall={
          gameState.pendingBettingStreet
            ? (potInputs[gameState.pendingBettingStreet]?.opponent ?? 0) -
              (potInputs[gameState.pendingBettingStreet]?.hero ?? 0) || BIG_BLIND
            : BIG_BLIND
        }
        recommendation={
          gameState.pendingBettingStreet &&
          gameState.potInfo?.current_street === gameState.pendingBettingStreet
            ? gameState.potInfo.recommendation
            : null
        }
        toCall={
          gameState.potInfo?.to_call ?? null
        }
        onCostToCallChange={handleModalCostToCallChange}
        onSubmit={handleConfirmBetting}
      />

      <div className="layout">
        <div className="main-area">
          <div className="video-wrap">
            <VideoFeed src="/video_feed" />
          </div>
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
          />

          <PotOddsPanel
            potInputs={potInputs}
            potInfo={gameState.potInfo}
            onStartingPotChange={updateStartingPot}
            onStreetChange={updateStreet}
            onCostToCallChange={updateCostToCall}
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
  )
}

export default App
