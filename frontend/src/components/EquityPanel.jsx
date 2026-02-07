import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

function formatMoney(val) {
  if (val == null || val === undefined || Number.isNaN(Number(val))) return '—'
  return '$' + Number(val).toFixed(2)
}

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
        <Typography sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.9rem' }}>{street}</Typography>
        <Typography sx={{ fontWeight: 600, color: '#eee', fontSize: '0.9rem' }}>
          {displayVal != null ? `${displayVal}% chance to win` : '—'}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={displayVal != null ? pct : 0}
        sx={{
          '& .MuiLinearProgress-bar': { bgcolor: equityColor(value), borderRadius: 6 },
        }}
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
}) {
  const hasHole = holeCount >= 2
  const hasFullData = holeCount >= 2 && flopCount >= 3
  const recs = betRecommendations || {}
  const oppCount = Math.max(0, playersInHand - 1)

  let message = ''
  if (equityError) message = equityError
  else if (!hasHole) message = 'Lock 2 hole cards to see preflop equity.'
  else if (!hasFullData) message = 'Lock 3 flop cards to see postflop equity and bet recommendations.'
  else message = `Equity = % chance to win vs ${oppCount} opponent${oppCount !== 1 ? 's' : ''} (from table).`

  const recColor = {
    call: '#2ecc71', fold: '#e74c3c', raise: '#f39c12', check: '#3498db', no_bet: '#888',
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Win probability &amp; bet advice</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>{message}</Typography>

      <Stack spacing={1.75} sx={{ mb: 2.5 }}>
        <EquityBar street="Preflop" value={equityPreflop} />
        <EquityBar street="Flop" value={equityFlop} />
        <EquityBar street="Turn" value={equityTurn} />
        <EquityBar street="River" value={equityRiver} />
      </Stack>

      {(hasHole || hasFullData) && potInfo && (
        <Paper sx={{ p: 1.5, bgcolor: '#1e1e1e', borderLeft: '4px solid #3498db', mb: 2 }}>
          <Typography variant="body2" sx={{ color: '#a0a0c0', mb: 1 }}>Bet recommendation</Typography>
          {potInfo.to_call > 0 ? (
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: recColor[potInfo.recommendation] || '#888' }}>
              {potInfo.recommendation === 'call' && <>CALL {formatMoney(potInfo.to_call)} (pot odds)</>}
              {potInfo.recommendation === 'fold' && <>FOLD — need {formatMoney(potInfo.to_call)} to call, pot odds say no</>}
              {potInfo.recommendation === 'raise' && <>RAISE (strong hand vs {formatMoney(potInfo.to_call)} to call)</>}
              {potInfo.recommendation === 'check' && <>CHECK</>}
              {potInfo.recommendation === 'no_bet' && <>No bet to call</>}
            </Typography>
          ) : (
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: recColor[potInfo.recommendation] || '#888' }}>
              {potInfo.recommendation === 'raise' && <>RAISE — bet 1/2-2/3 pot for value</>}
              {potInfo.recommendation === 'check' && <>CHECK or small bet</>}
              {!['raise', 'check'].includes(potInfo.recommendation) && <>No bet to call — check or bet</>}
            </Typography>
          )}
        </Paper>
      )}

      {hasFullData && (
        <Box>
          <Typography variant="body2" sx={{ color: '#a0a0c0', mb: 1 }}>Bet recommendation by street</Typography>
          <Stack spacing={1}>
            {['Preflop', 'Flop', 'Turn', 'River'].map((s) => (
              <Box key={s} sx={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 1.25, fontSize: '0.9rem' }}>
                <Typography sx={{ fontWeight: 600, color: '#3498db', fontSize: '0.9rem' }}>{s}</Typography>
                <Typography sx={{ color: '#ccc', fontSize: '0.9rem' }}>{recs[s.toLowerCase()] || '—'}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  )
}
