import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (open) {
      refresh()
    }
  }, [open])

  const handleSwitch = async (idx) => {
    const res = await switchCamera(idx)
    if (res && res.ok) {
      setCurrentIndex(idx)
      setError(null)
    }
  }

  return (
    <div className="camera-selector">
      <button
        type="button"
        className="btn btn-camera"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? 'Close camera list' : 'Switch camera'}
      </button>

      {open && (
        <div className="camera-list">
          {loading && <p className="status">Scanning cameras...</p>}
          {error && <p className="status" style={{ color: '#e74c3c' }}>{error}</p>}
          {cameras.length === 0 && !loading && (
            <p className="status">No cameras found.</p>
          )}
          {cameras.map((cam) => (
            <button
              key={cam.index}
              type="button"
              className={`camera-option ${cam.index === currentIndex ? 'active' : ''}`}
              onClick={() => handleSwitch(cam.index)}
            >
              {cam.name}
              {cam.index === currentIndex && ' (active)'}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-camera"
            style={{ marginTop: '8px' }}
            onClick={refresh}
            disabled={loading}
          >
            Refresh list
          </button>
        </div>
      )}
    </div>
  )
}
