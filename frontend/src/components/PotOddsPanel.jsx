import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

function formatNumber(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—'
  return Number(val).toFixed(1)
}

function formatMoney(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—'
  return '$' + Number(val).toFixed(2)
}

const recColor = {
  call: '#2ecc71', fold: '#e74c3c', raise: '#f39c12', check: '#3498db', no_bet: '#888',
}

export default function PotOddsPanel({
  potInfo,
  smallBlind = 0.1,
  bigBlind = 0.2,
  buyIn = 10,
}) {
  const recommendation = potInfo?.recommendation || 'no_bet'
  const recommendationText =
    recommendation === 'call' ? 'CALL'
    : recommendation === 'fold' ? 'FOLD'
    : recommendation === 'raise' ? 'RAISE'
    : recommendation === 'check' ? 'CHECK'
    : '—'
  const toCall = potInfo?.to_call ?? 0
  const hasBetToCall = toCall > 0

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Pot &amp; odds (from table)</Typography>

      <Typography variant="body2" sx={{ mb: 1.5 }}>
        Blinds: {formatMoney(smallBlind)} / {formatMoney(bigBlind)} &nbsp;|&nbsp; Buy-in: {formatMoney(buyIn)}
      </Typography>

      <Paper
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 2,
          mb: 2,
          background: 'linear-gradient(135deg, #252525 0%, #1e1e1e 100%)',
          border: '2px solid #3498db',
        }}
      >
        {hasBetToCall ? (
          <>
            <Typography sx={{ fontSize: '0.9rem', color: '#a0a0c0', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
              Amount to call
            </Typography>
            <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: '#2ecc71' }}>
              {formatMoney(toCall)}
            </Typography>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: '0.9rem', color: '#a0a0c0', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
              No bet to call
            </Typography>
            <Typography sx={{ fontSize: '1.1rem', color: '#3498db' }}>
              Check or bet
            </Typography>
          </>
        )}
      </Paper>

      <Paper sx={{ p: 1.5, bgcolor: '#1e1e1e' }}>
        {hasBetToCall && (
          <>
            <Typography sx={{ fontSize: '0.9rem', mb: 0.5 }}>
              Pot (before your call): <strong>{formatMoney(potInfo?.pot_before_call)}</strong>
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', mb: 0.5 }}>
              To call: <strong>{formatMoney(potInfo?.to_call)}</strong>
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', mb: 0.5 }}>
              Pot odds: risk {formatMoney(potInfo?.to_call)} to win{' '}
              {formatMoney((potInfo?.pot_before_call ?? 0) + (potInfo?.to_call ?? 0))} → need{' '}
              <strong>{formatNumber(potInfo?.required_equity_pct)}%</strong> equity to call
            </Typography>
          </>
        )}
        <Typography sx={{ mt: 1, fontSize: '1rem', fontWeight: 600 }}>
          Recommendation:{' '}
          <Box component="span" sx={{ color: recColor[recommendation] || '#888' }}>
            {recommendationText}
          </Box>
        </Typography>
        {potInfo?.recommendation_reason && (
          <Typography variant="body2" sx={{ mt: 0.75, color: '#888' }}>
            {potInfo.recommendation_reason}
          </Typography>
        )}
      </Paper>
    </Box>
  )
}
