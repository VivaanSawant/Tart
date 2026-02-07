import { useCallback, useEffect, useMemo, useState } from 'react'
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
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

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
import MoveLog, { getPlayerProfile } from './components/MoveLog'
import CoachChat from './components/CoachChat'
import OpponentProfiles from './components/OpponentProfiles'
import HandProbabilitiesPanel from './components/HandProbabilitiesPanel'
import PotOddsPanel from './components/PotOddsPanel'
import BotGameView from './components/BotGameView'
import TableSimulatorView from './components/TableSimulatorView'
import VideoFeed from './components/VideoFeed'

const SMALL_BLIND = 0.1
const BIG_BLIND = 0.2
const BUY_IN = 10

const TAB_VALUES = ['game', 'movelog', 'bots']

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10]

function App() {
  const [showLanding, setShowLanding] = useState(true)
  const [activeTab, setActiveTab] = useState('game')
  const [tableNumPlayers, setTableNumPlayers] = useState(6)
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
    handProbabilities: null,
    handProbabilitiesStage: null,
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
      handProbabilities: data.hand_probabilities || null,
      handProbabilitiesStage: data.hand_probabilities_stage || null,
    })
  }

  useEffect(() => {
    handleFetchState()
    const interval = setInterval(handleFetchState, 500)
    return () => clearInterval(interval)
  }, [])

  // Sync table player count from server state when available
  useEffect(() => {
    const n = gameState.table?.num_players
    if (n != null && n >= 2 && n <= 10) setTableNumPlayers(n)
  }, [gameState.table?.num_players])

  const handleClear = async () => {
    const res = await clearHand()
    if (res && res.ok) handleFetchState()
  }

  const handleNewTable = async () => {
    const res = await tableReset(tableNumPlayers)
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

  const playerProfile = useMemo(() => getPlayerProfile(moveLog), [moveLog])

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
            onChange={(_e, v) => {
              if (v === 'bots' && moveLog.length === 0) return
              setActiveTab(v)
            }}
            sx={{ minHeight: 40, flexShrink: 0 }}
          >
            {TAB_VALUES.map((t) => (
              <Tab
                key={t}
                value={t}
                label={t === 'movelog' ? 'Move Log' : t === 'bots' ? 'Bots' : t.charAt(0).toUpperCase() + t.slice(1)}
                disabled={t === 'bots' && moveLog.length === 0}
              />
            ))}
          </Tabs>

          {/* Centered slot for the actions HUD (rendered via portal from TableSimulatorView) */}
          <Box id="actions-hud-slot" sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }} />

          {/* Right side: Bots tab → New game + players (portalled from BotGameView); Game/Move Log → Players + Clear hand + New table */}
          <Box id="header-right-slot" sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeTab !== 'bots' && (
              <>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel id="table-players-label">Players</InputLabel>
                  <Select
                    labelId="table-players-label"
                    value={tableNumPlayers}
                    label="Players"
                    onChange={(e) => setTableNumPlayers(Number(e.target.value))}
                  >
                    {PLAYER_COUNT_OPTIONS.map((n) => (
                      <MenuItem key={n} value={n}>{n}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button variant="outlined" color="error" size="small" onClick={handleClear}>
                  Clear hand
                </Button>
                <Button variant="contained" color="secondary" size="small" onClick={handleNewTable}>
                  New table
                </Button>
              </>
            )}
          </Box>
        </Box>

        {/* Tab content */}
        {activeTab === 'movelog' ? (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 2, py: 2, overflow: 'hidden' }}>
            {/* Left: Move Log + Opponent Profiles (scrollable) */}
            <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
              <Stack spacing={2}>
                <OpponentProfiles />
                <MoveLog moves={moveLog} />
              </Stack>
            </Box>
            {/* Right: Coach Chat (fixed height, always visible) */}
            <Box sx={{ width: 360, flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <CoachChat profile={playerProfile} moves={moveLog} />
            </Box>
          </Box>
        ) : activeTab === 'bots' ? (
          moveLog.length === 0 ? (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, py: 4 }}>
              <Typography variant="h6" color="text.secondary">Bots tab is locked</Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Make at least one move in the Game tab to unlock the Bots. Your Move Log builds your profile so bots can play against your tendencies.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', px: 2 }}>
              <BotGameView playerProfile={playerProfile} />
            </Box>
          )
        ) : (
          /* Game (default) and Info tabs both show the same layout:
             table on top, 3-column info panels below, video feed bottom-right */
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Table area */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                overflow: 'visible',
                px: 3,
                py: 1.5,
                /* Take ~55% of available space for the table */
                flex: '0 0 55%',
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

            {/* Info panels — 3-column layout below the table */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: '1.3fr 1fr 1fr 1fr',
                gap: 1.5,
                pt: 1,
                pb: 0.5,
              }}
            >
              <Paper sx={{ p: 1.5, overflowY: 'auto', minHeight: 0 }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: '0.85rem' }}>Play style</Typography>
                <Typography variant="body2" sx={{ mb: 1, fontSize: '0.78rem' }}>
                  Affects call/raise equity thresholds.
                </Typography>
                <ToggleButtonGroup
                  value={gameState.playStyle}
                  exclusive
                  onChange={handlePlayStyleChange}
                  size="small"
                  sx={{ flexWrap: 'wrap' }}
                >
                  <ToggleButton value="conservative" sx={{ fontSize: '0.75rem', py: 0.5 }}>Conservative</ToggleButton>
                  <ToggleButton value="neutral" sx={{ fontSize: '0.75rem', py: 0.5 }}>Neutral</ToggleButton>
                  <ToggleButton value="aggressive" sx={{ fontSize: '0.75rem', py: 0.5 }}>Aggressive</ToggleButton>
                </ToggleButtonGroup>
                {/* Video feed tucked under play style */}
                <Box sx={{ mt: 1.5 }}>
                  <CameraSelector />
                  <Box sx={{ mt: 0.5 }}>
                    <VideoFeed src="/video_feed" />
                  </Box>
                </Box>
              </Paper>

              <Paper sx={{ p: 1.5, overflowY: 'auto', minHeight: 0 }}>
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
              </Paper>

              <Paper sx={{ p: 1.5, overflowY: 'auto', minHeight: 0 }}>
                <HandProbabilitiesPanel
                  probabilities={gameState.handProbabilities}
                  stage={gameState.handProbabilitiesStage}
                  holeCount={gameState.holeCards.length}
                />
              </Paper>

              <Paper sx={{ p: 1.5, overflowY: 'auto', minHeight: 0 }}>
                <PotOddsPanel
                  potInfo={gameState.potInfo}
                  smallBlind={SMALL_BLIND}
                  bigBlind={BIG_BLIND}
                  buyIn={BUY_IN}
                />
              </Paper>
            </Box>
          </Box>
        )}
      </Container>
    </CameraPermission>
  )
}

export default App
