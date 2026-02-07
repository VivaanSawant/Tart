import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

function formatMoney(val) {
  if (val == null || val === undefined || Number.isNaN(Number(val))) return '—'
  return '$' + Number(val).toFixed(2)
}

const recColor = {
  call: '#2ecc71',
  fold: '#e74c3c',
  raise: '#f39c12',
  check: '#3498db',
  no_bet: '#888',
}

export default function BetRecommendationPanel({
  potInfo,
  betRecommendations = {},
  holeCount = 0,
  flopCount = 0,
}) {
  const hasHole = holeCount >= 2
  const hasFullData = holeCount >= 2 && flopCount >= 3
  const recs = betRecommendations

  return (
    <Box sx={{ fontSize: '0.8rem' }}>
      {(hasHole || hasFullData) && potInfo && (
        <Paper sx={{ p: 1, bgcolor: '#1e1e1e', borderLeft: '3px solid #3498db', mb: 1 }}>
          <Typography variant="body2" sx={{ color: '#a0a0c0', mb: 0.5, fontSize: '0.75rem' }}>Bet recommendation</Typography>
          {potInfo.to_call > 0 ? (
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: recColor[potInfo.recommendation] || '#888' }}>
              {potInfo.recommendation === 'call' && <>CALL {formatMoney(potInfo.to_call)} (pot odds)</>}
              {potInfo.recommendation === 'fold' && <>FOLD — need {formatMoney(potInfo.to_call)} to call</>}
              {potInfo.recommendation === 'raise' && <>RAISE (strong vs {formatMoney(potInfo.to_call)} to call)</>}
              {potInfo.recommendation === 'check' && <>CHECK</>}
              {potInfo.recommendation === 'no_bet' && <>No bet to call</>}
            </Typography>
          ) : (
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: recColor[potInfo.recommendation] || '#888' }}>
              {potInfo.recommendation === 'raise' && <>RAISE — bet 1/2-2/3 pot</>}
              {potInfo.recommendation === 'check' && <>CHECK or small bet</>}
              {!['raise', 'check'].includes(potInfo.recommendation) && <>No bet to call</>}
            </Typography>
          )}
        </Paper>
      )}

      {hasFullData && (
        <Box>
          <Typography variant="body2" sx={{ color: '#a0a0c0', mb: 0.5, fontSize: '0.75rem' }}>Past recommendations by street</Typography>
          <Stack spacing={0.5}>
            {['Preflop', 'Flop', 'Turn', 'River'].map((s) => (
              <Box key={s} sx={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 0.5 }}>
                <Typography sx={{ fontWeight: 600, color: '#3498db', fontSize: '0.8rem' }}>{s}</Typography>
                <Typography sx={{ color: '#ccc', fontSize: '0.8rem' }} noWrap>{recs[s.toLowerCase()] || '—'}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  )
}
