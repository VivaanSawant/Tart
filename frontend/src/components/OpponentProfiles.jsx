import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'

import { fetchOpponentProfiles, renameOpponent } from '../api/backend'

function aggressionColor(score) {
  if (score >= 67) return '#e74c3c'
  if (score >= 34) return '#f39c12'
  return '#2ecc71'
}

function aggressionLabel(level) {
  if (level === 'aggressive') return 'Aggressive'
  if (level === 'conservative') return 'Conservative'
  return 'Neutral'
}

export default function OpponentProfiles() {
  const [opponents, setOpponents] = useState({})
  const [editingSeat, setEditingSeat] = useState(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    const res = await fetchOpponentProfiles()
    if (res?.ok) setOpponents(res.opponents || {})
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 3000) // poll every 3s
    return () => clearInterval(interval)
  }, [load])

  const startEdit = (seat, currentName) => {
    setEditingSeat(seat)
    setEditName(currentName)
  }

  const saveEdit = async (seat) => {
    if (editName.trim()) {
      await renameOpponent(Number(seat), editName.trim())
      await load()
    }
    setEditingSeat(null)
  }

  const entries = Object.entries(opponents).sort(
    ([a], [b]) => Number(a) - Number(b)
  )

  if (entries.length === 0) {
    return (
      <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
        <Typography variant="h6" gutterBottom sx={{ fontSize: '0.95rem' }}>
          Opponent Profiles
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No opponents tracked yet. Play hands in the Game tab to build opponent profiles.
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
      <Typography variant="h6" gutterBottom sx={{ fontSize: '0.95rem' }}>
        Opponent Profiles
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Built from observed actions. Click the pencil to rename. Use these profiles in the Bots tab.
      </Typography>

      <Stack spacing={1.5}>
        {entries.map(([seatStr, data]) => {
          const { name, seat, profile } = data
          const hasProfile = profile && profile.total_actions > 0

          return (
            <Paper
              key={seatStr}
              variant="outlined"
              sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)' }}
            >
              {/* Name row */}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                {editingSeat === seatStr ? (
                  <>
                    <TextField
                      size="small"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(seatStr) }}
                      autoFocus
                      sx={{ flex: 1, '& input': { py: 0.5, px: 1, fontSize: '0.85rem' } }}
                    />
                    <IconButton size="small" onClick={() => saveEdit(seatStr)}>
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
                      {name}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                        Seat {seat}
                      </Typography>
                    </Typography>
                    <IconButton size="small" onClick={() => startEdit(seatStr, name)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
              </Stack>

              {!hasProfile ? (
                <Typography variant="caption" color="text.secondary">
                  No actions recorded yet
                </Typography>
              ) : (
                <>
                  {/* Aggression bar */}
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                    <Typography variant="caption" sx={{ width: 70 }}>Aggression</Typography>
                    <Box sx={{ flex: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, profile.aggression)}
                        sx={{
                          height: 8,
                          borderRadius: 1,
                          bgcolor: 'rgba(255,255,255,0.08)',
                          '& .MuiLinearProgress-bar': { bgcolor: aggressionColor(profile.aggression) },
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: aggressionColor(profile.aggression), minWidth: 32 }}>
                      {profile.aggression}
                    </Typography>
                    <Chip
                      label={aggressionLabel(profile.aggression_level)}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: aggressionColor(profile.aggression) + '22',
                        color: aggressionColor(profile.aggression),
                        fontWeight: 700,
                      }}
                    />
                  </Stack>

                  {/* Fold % */}
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                    <Typography variant="caption" sx={{ width: 70 }}>Fold %</Typography>
                    <Box sx={{ flex: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, profile.fold_pct)}
                        sx={{
                          height: 8,
                          borderRadius: 1,
                          bgcolor: 'rgba(255,255,255,0.08)',
                          '& .MuiLinearProgress-bar': { bgcolor: '#3498db' },
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 32 }}>
                      {profile.fold_pct}%
                    </Typography>
                  </Stack>

                  {/* Action mix */}
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {['call', 'raise', 'fold', 'check'].map((act) => (
                      <Chip
                        key={act}
                        label={`${act}: ${profile.by_action[act] || 0}`}
                        size="small"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    ))}
                    <Chip
                      label={`${profile.total_actions} total`}
                      size="small"
                      sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'rgba(255,255,255,0.1)' }}
                    />
                  </Stack>

                  {/* Avg raise */}
                  {profile.avg_raise > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Avg raise: ${profile.avg_raise.toFixed(2)}
                    </Typography>
                  )}
                </>
              )}
            </Paper>
          )
        })}
      </Stack>
    </Paper>
  )
}
