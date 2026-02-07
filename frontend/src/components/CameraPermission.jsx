import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pokerplaya_camera_dismissed'

export default function CameraPermission({ children }) {
  // 'prompt' | 'granted' | 'denied' | 'unsupported'
  const [status, setStatus] = useState('prompt')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) {
      setDismissed(true)
      return
    }

    // Check current permission state if the Permissions API is available
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'camera' })
        .then((result) => {
          setStatus(result.state) // 'granted', 'denied', or 'prompt'
          result.addEventListener('change', () => setStatus(result.state))
        })
        .catch(() => {
          // Permissions API not supported for camera -- fall back to prompt
          setStatus('prompt')
        })
    } else if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('unsupported')
    }
  }, [])

  const requestAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      // Immediately stop the stream -- we just needed the permission grant
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

  // Already granted or user dismissed -- render the app
  if (dismissed || status === 'granted') {
    return children
  }

  return (
    <div className="permission-overlay">
      <div className="permission-box">
        <h2>Camera access needed</h2>

        {status === 'unsupported' ? (
          <>
            <p>
              Your browser does not support camera access. The backend will still
              use your Mac's camera, but you won't be able to grant permission
              from here.
            </p>
            <div className="permission-actions">
              <button type="button" className="btn btn-primary" onClick={skip}>
                Continue anyway
              </button>
            </div>
          </>
        ) : status === 'denied' ? (
          <>
            <p>
              Camera permission was denied. To fix this, open your browser's
              site settings and allow camera access, then reload the page.
            </p>
            <p className="permission-hint">
              The backend can still use your Mac's camera directly -- this
              permission is for browser-level access.
            </p>
            <div className="permission-actions">
              <button type="button" className="btn btn-primary" onClick={skip}>
                Continue without browser camera
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              PokerPlaya needs camera access to detect cards. Click below to
              grant permission in your browser.
            </p>
            <p className="permission-hint">
              If you're using Continuity Camera or an external webcam, make sure
              it's connected before granting access.
            </p>
            <div className="permission-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={requestAccess}
              >
                Allow camera access
              </button>
              <button type="button" className="btn btn-secondary" onClick={skip}>
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
