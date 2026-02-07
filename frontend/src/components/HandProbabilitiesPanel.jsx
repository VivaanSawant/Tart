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

// Index of best hand already made (first hand with ~100% probability), or -1 if none
function getCurrentHandIndex(probabilities) {
  if (!probabilities) return -1
  const idx = HAND_ORDER.findIndex((hand) => {
    const pct = probabilities[hand]
    return pct != null && pct >= 99.99
  })
  return idx
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
  const currentHandIndex = getCurrentHandIndex(probabilities)

  // Scale bars relative to the largest probability (excluding hands already made for visual scale)
  const maxProb = Math.max(
    ...HAND_ORDER.map((h, i) => (i <= currentHandIndex ? 0 : probabilities[h] || 0)),
    0.01
  )

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
        {HAND_ORDER.map((hand, index) => {
          const pct = probabilities[hand] || 0
          const isCurrentHand = index === currentHandIndex
          const isOutdated = currentHandIndex >= 0 && index > currentHandIndex

          const textColor = isCurrentHand
            ? '#2ecc71'
            : isOutdated
              ? '#666'
              : '#b0b0b0'
          const barColor = isCurrentHand ? '#2ecc71' : isOutdated ? '#444' : '#888'
          const opacity = isOutdated ? 0.6 : 1

          return (
            <Box key={hand} sx={{ opacity }}>
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
                    color: textColor,
                    fontWeight: isCurrentHand ? 600 : 500,
                    lineHeight: 1.4,
                  }}
                >
                  {hand}
                </Typography>
                <Typography
                  sx={{ fontSize: '0.7rem', color: isOutdated ? '#555' : '#eee', fontWeight: 600, lineHeight: 1.4 }}
                >
                  {(pct >= 99.99 ? '—' : formatPct(pct))}
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
                    bgcolor: barColor,
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
