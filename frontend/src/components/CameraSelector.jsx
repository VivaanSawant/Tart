import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { listCameras, switchCamera } from '../api/backend'

export default function CameraSelector() {
  const [cameras, setCameras] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const data = await listCameras()
    setLoading(false)
    if (data) {
      setCameras(data.cameras || [])
      setCurrentIndex(data.current_index ?? 0)
      setError(data.error || null)
    }
  }

  useEffect(() => { if (open) refresh() }, [open])

  const handleSwitch = async (idx) => {
    const res = await switchCamera(idx)
    if (res && res.ok) { setCurrentIndex(idx); setError(null) }
  }

  return (
    <Box>
      <Button
        variant="contained"
        size="small"
        onClick={() => setOpen((p) => !p)}
        fullWidth
      >
        {open ? 'Close camera list' : 'Switch camera'}
      </Button>

      <Collapse in={open}>
        <Box sx={{ mt: 1, bgcolor: '#2a2a2a', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
          {loading && <Typography variant="caption" sx={{ color: '#888' }}>Scanning cameras...</Typography>}
          {error && <Typography variant="caption" color="error">{error}</Typography>}
          {cameras.length === 0 && !loading && (
            <Typography variant="caption" sx={{ color: '#888' }}>No cameras found.</Typography>
          )}
          <List dense disablePadding>
            {cameras.map((cam) => (
              <ListItemButton
                key={cam.index}
                selected={cam.index === currentIndex}
                onClick={() => handleSwitch(cam.index)}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemText primary={cam.name} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                {cam.index === currentIndex && (
                  <Chip label="active" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />
                )}
              </ListItemButton>
            ))}
          </List>
          <Button size="small" variant="outlined" onClick={refresh} disabled={loading} sx={{ mt: 0.5 }} fullWidth>
            Refresh list
          </Button>
        </Box>
      </Collapse>
    </Box>
  )
}
