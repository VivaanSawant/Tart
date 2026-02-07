import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'

const STORAGE_KEY = 'pokerplaya_camera_dismissed'

export default function CameraPermission({ children }) {
  const [status, setStatus] = useState('prompt')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) {
      setDismissed(true)
      return
    }
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'camera' })
        .then((result) => {
          setStatus(result.state)
          result.addEventListener('change', () => setStatus(result.state))
        })
        .catch(() => setStatus('prompt'))
    } else if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('unsupported')
    }
  }, [])

  const requestAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((t) => t.stop())
      setStatus('granted')
      sessionStorage.setItem(STORAGE_KEY, '1')
      setDismissed(true)
    } catch {
      setStatus('denied')
    }
  }

  const skip = () => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  if (dismissed || status === 'granted') return children

  return (
    <Dialog open maxWidth="sm" fullWidth>
      <DialogTitle>Camera access needed</DialogTitle>
      <DialogContent>
        {status === 'unsupported' ? (
          <Typography variant="body2">
            Your browser does not support camera access. The backend will still use your Mac&apos;s camera,
            but you won&apos;t be able to grant permission from here.
          </Typography>
        ) : status === 'denied' ? (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Camera permission was denied. To fix this, open your browser&apos;s site settings and allow
              camera access, then reload the page.
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              The backend can still use your Mac&apos;s camera directly — this permission is for browser-level access.
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              PokerPlaya needs camera access to detect cards. Click below to grant permission in your browser.
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              If you&apos;re using Continuity Camera or an external webcam, make sure it&apos;s connected before granting access.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {status === 'unsupported' ? (
          <Button variant="contained" onClick={skip}>Continue anyway</Button>
        ) : status === 'denied' ? (
          <Button variant="contained" onClick={skip}>Continue without browser camera</Button>
        ) : (
          <>
            <Button variant="outlined" onClick={skip}>Skip</Button>
            <Button variant="contained" color="success" onClick={requestAccess}>Allow camera access</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
