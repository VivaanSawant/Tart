import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import BetRecommendationPanel from './BetRecommendationPanel'

function formatEquity(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return null
  return Number(val).toFixed(1)
}

function equityColor(pct) {
  if (pct == null || pct < 0) return '#e74c3c'
  if (pct < 35) return '#e74c3c'
  if (pct < 50) return '#e67e22'
  if (pct < 65) return '#f1c40f'
  if (pct < 80) return '#2ecc71'
  return '#27ae60'
}

function EquityBar({ street, value }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0
  const displayVal = formatEquity(value)
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
        <Typography sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>{street}</Typography>
        <Typography sx={{ fontWeight: 600, color: '#eee', fontSize: '0.8rem' }}>
          {displayVal != null ? `${displayVal}%` : '—'}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={displayVal != null ? pct : 0}
        sx={{ height: 6, '& .MuiLinearProgress-bar': { bgcolor: equityColor(value), borderRadius: 4 } }}
      />
    </Box>
  )
}

export default function EquityPanel({
  equityPreflop,
  equityFlop,
  equityTurn,
  equityRiver,
  equityError,
  betRecommendations,
  potInfo,
  holeCount,
  flopCount,
  playersInHand = 2,
  equityOnly = false,
}) {
  const hasFullData = holeCount >= 2 && flopCount >= 3

  return (
    <Box>
      {!equityOnly && (
        <Typography variant="h6" gutterBottom sx={{ fontSize: '0.85rem' }}>
          Win probability &amp; bet advice
        </Typography>
      )}

      <Stack spacing={1} sx={{ mb: equityOnly ? 0 : 1.5 }}>
        <EquityBar street="Preflop" value={equityPreflop} />
        <EquityBar street="Flop" value={equityFlop} />
        <EquityBar street="Turn" value={equityTurn} />
        <EquityBar street="River" value={equityRiver} />
      </Stack>

      {!equityOnly && (
        <BetRecommendationPanel
          potInfo={potInfo}
          betRecommendations={betRecommendations}
          holeCount={holeCount}
          flopCount={flopCount}
        />
      )}
    </Box>
  )
}
