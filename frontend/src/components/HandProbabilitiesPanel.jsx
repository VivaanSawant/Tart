import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'

const HAND_ORDER = [
  'Royal Flush',
  'Straight Flush',
  'Four of a Kind',
  'Full House',
  'Flush',
  'Straight',
  'Three of a Kind',
  'Two Pair',
  'Pair',
  'High Card',
]

const HAND_COLORS = {
  'Royal Flush': '#FFD700',
  'Straight Flush': '#FF6347',
  'Four of a Kind': '#FF4500',
  'Full House': '#FF8C00',
  'Flush': '#1E90FF',
  'Straight': '#32CD32',
  'Three of a Kind': '#9370DB',
  'Two Pair': '#20B2AA',
  'Pair': '#87CEEB',
  'High Card': '#A9A9A9',
}

function formatPct(val) {
  if (val == null) return '—'
  if (val < 0.01 && val > 0) return '<0.01%'
  if (val >= 10) return val.toFixed(1) + '%'
  return val.toFixed(2) + '%'
}

export default function HandProbabilitiesPanel({ probabilities, stage, holeCount }) {
  if (holeCount < 2) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ fontSize: '0.85rem' }}>
          Hand probabilities
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
          Lock 2 hole cards to see the probability of making each poker hand.
        </Typography>
      </Box>
    )
  }

  if (!probabilities) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ fontSize: '0.85rem' }}>
          Hand probabilities
        </Typography>
        {stage === 'preflop' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
              Computing pre-flop probabilities…
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
            Waiting for card data…
          </Typography>
        )}
      </Box>
    )
  }

  const stageLabel = stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : ''

  // Scale bars relative to the largest probability
  const maxProb = Math.max(...HAND_ORDER.map((h) => probabilities[h] || 0), 0.01)

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ fontSize: '0.85rem' }}>
        Hand probabilities{' '}
        {stageLabel && (
          <Typography
            component="span"
            sx={{ fontSize: '0.75rem', color: '#3498db', fontWeight: 400 }}
          >
            ({stageLabel})
          </Typography>
        )}
      </Typography>

      <Stack spacing={0.4}>
        {HAND_ORDER.map((hand) => {
          const pct = probabilities[hand] || 0
          return (
            <Box key={hand}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    color: HAND_COLORS[hand] || '#ccc',
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {hand}
                </Typography>
                <Typography
                  sx={{ fontSize: '0.7rem', color: '#eee', fontWeight: 600, lineHeight: 1.4 }}
                >
                  {formatPct(pct)}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (pct / maxProb) * 100)}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.08)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: HAND_COLORS[hand] || '#888',
                    borderRadius: 2,
                  },
                }}
              />
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
