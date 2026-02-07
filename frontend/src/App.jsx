import { useCallback, useEffect, useState } from 'react'
import './App.css'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'

import {
  clearHand,
  fetchState,
  setPlayStyle,
  tableReset,
} from './api/backend'
import CameraPermission from './components/CameraPermission'
import CameraSelector from './components/CameraSelector'
import BetRecommendationPanel from './components/BetRecommendationPanel'
import EquityPanel from './components/EquityPanel'
import LandingPage from './components/LandingPage'
import MoveLog from './components/MoveLog'
import BotGameView from './components/BotGameView'
import TableSimulatorView from './components/TableSimulatorView'
import VideoFeed from './components/VideoFeed'

const TAB_VALUES = ['game', 'movelog', 'bots']

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
    if (res && res.ok) handleFetchState()
  }

  const handleNewTable = async () => {
    const res = await tableReset()
    if (res && res.ok) handleFetchState()
  }

  const handlePlayStyleChange = async (_e, value) => {
    if (value == null) return
    const res = await setPlayStyle(value)
    if (res && res.ok) handleFetchState()
  }

  const handleHeroMove = useCallback((move) => {
    setMoveLog((prev) => [...prev, { ...move, timestamp: Date.now() }])
  }, [])

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />
  }

  return (
    <CameraPermission>
      <Container
        maxWidth="lg"
        disableGutters
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          px: 2,
          py: 1.5,
        }}
      >
        {/* Navigation bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, flexShrink: 0, gap: 1 }}>
          <Tabs
            value={activeTab}
            onChange={(_e, v) => setActiveTab(v)}
            sx={{ minHeight: 40, flexShrink: 0 }}
          >
            {TAB_VALUES.map((t) => (
              <Tab key={t} value={t} label={t === 'movelog' ? 'Move Log' : t.charAt(0).toUpperCase() + t.slice(1)} />
            ))}
          </Tabs>

          {/* Centered slot for the actions HUD (rendered via portal from TableSimulatorView) */}
          <Box id="actions-hud-slot" sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }} />

          <Box sx={{ flexShrink: 0, display: 'flex', gap: 1 }}>
            <Button variant="outlined" color="error" size="small" onClick={handleClear}>
              Clear hand
            </Button>
            <Button variant="contained" color="secondary" size="small" onClick={handleNewTable}>
              New table
            </Button>
          </Box>
        </Box>

        {/* Tab content */}
        {activeTab === 'movelog' ? (
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', py: 2 }}>
            <MoveLog moves={moveLog} />
          </Box>
        ) : activeTab === 'bots' ? (
          <div className="table-hero">
            <BotGameView />
          </div>
        ) : (
          /* Game (default) and Info tabs both show the same layout:
             table on top, 3-column info panels below, video feed bottom-right */
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Table area — same table look as Bot Game tab */}
            <div className="table-hero" style={{ flex: '0 0 55%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  flex: 1,
                  overflow: 'visible',
                  px: 3,
                  py: 1.5,
                  minHeight: 0,
                }}
              >
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
                onHeroMove={handleHeroMove}
              />
              </Box>
            </div>

            {/* Info panels — 3 equal-height cards, no scroll */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 1.25,
                pt: 2,
                pb: 0.5,
                alignItems: 'stretch',
              }}
            >
              <Paper
                sx={{
                  p: 1.25,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <Typography variant="h6" gutterBottom sx={{ fontSize: '1.05rem', fontWeight: 600, flexShrink: 0 }}>Card Detection</Typography>
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <CameraSelector />
                  <Box sx={{ mt: 0.5, flex: 1, minHeight: 0, maxHeight: 140, overflow: 'hidden' }}>
                    <VideoFeed src="/video_feed" />
                  </Box>
                </Box>
              </Paper>

              <Paper
                sx={{
                  p: 1.25,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <Typography variant="h6" gutterBottom sx={{ fontSize: '1.05rem', fontWeight: 600, flexShrink: 0 }}>Win Probability</Typography>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <EquityPanel
                    equityPreflop={gameState.equityPreflop}
                    equityFlop={gameState.equityFlop}
                    equityTurn={gameState.equityTurn}
                    equityRiver={gameState.equityRiver}
                    equityError={gameState.equityError}
                    holeCount={gameState.holeCards.length}
                    flopCount={gameState.flopCards.length}
                    playersInHand={gameState.table?.players_in_hand?.length ?? 6}
                    equityOnly
                  />
                </Box>
              </Paper>

              <Paper
                sx={{
                  p: 1.25,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <Typography variant="h6" gutterBottom sx={{ fontSize: '1.05rem', fontWeight: 600, flexShrink: 0 }}>Betting &amp; Aggression</Typography>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <ToggleButtonGroup
                    value={gameState.playStyle}
                    exclusive
                    onChange={handlePlayStyleChange}
                    size="small"
                    sx={{ flexWrap: 'wrap', mb: 1, flexShrink: 0 }}
                  >
                    <ToggleButton value="conservative" sx={{ fontSize: '0.75rem', py: 0.5 }}>Conservative</ToggleButton>
                    <ToggleButton value="neutral" sx={{ fontSize: '0.75rem', py: 0.5 }}>Neutral</ToggleButton>
                    <ToggleButton value="aggressive" sx={{ fontSize: '0.75rem', py: 0.5 }}>Aggressive</ToggleButton>
                  </ToggleButtonGroup>
                  <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <BetRecommendationPanel
                      potInfo={gameState.potInfo}
                      betRecommendations={gameState.betRecommendations}
                      holeCount={gameState.holeCards.length}
                      flopCount={gameState.flopCards.length}
                    />
                  </Box>
                </Box>
              </Paper>
            </Box>
          </Box>
        )}
      </Container>
    </CameraPermission>
  )
}

export default App
