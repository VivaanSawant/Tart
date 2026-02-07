import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'

const STREET_LABELS = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' }

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '$0.00'
  return '$' + Number(val).toFixed(2)
}

const recColor = { call: '#2ecc71', fold: '#e74c3c' }

export default function BettingModal({ open, street, costToCall = 0.2, recommendation = null, onSubmit }) {
  if (!open || !street) return null

  const handleCall = () => onSubmit(street, Number(costToCall) || 0, true)
  const handleFold = () => onSubmit(street, 0, false)
  const showRec = recommendation === 'call' || recommendation === 'fold'

  return (
    <Dialog open maxWidth="xs" fullWidth>
      <DialogTitle>{STREET_LABELS[street] || street} — amount to call</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Cost to call (from table): {formatMoney(costToCall)}. Choose Call or Fold.
        </Typography>
        {showRec && (
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: recColor[recommendation] || '#888' }}>
            {recommendation === 'call' && <>Recommendation: CALL {formatMoney(costToCall)}</>}
            {recommendation === 'fold' && <>Recommendation: FOLD (need {formatMoney(costToCall)} to call)</>}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" color="success" onClick={handleCall}>
          Call {formatMoney(costToCall)}
        </Button>
        <Button variant="contained" color="error" onClick={handleFold}>
          Fold
        </Button>
      </DialogActions>
    </Dialog>
  )
}
