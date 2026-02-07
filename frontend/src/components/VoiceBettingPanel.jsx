import { useState, useRef, useCallback, useEffect } from 'react'
import { submitVoiceBettingAudio, submitVoiceBettingChunk, submitVoiceChunkTest } from '../api/backend'

const CHUNK_MS = 3500 // send every ~3.5 s for real-time

function formatMoney(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  return '$' + Number(val).toFixed(2)
}

export default function VoiceBettingPanel({
  voiceBettingAvailable = false,
  actions = [],
  error: serverError = null,
  onActionsUpdated,
}) {
  const [uploadError, setUploadError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcriptLog, setTranscriptLog] = useState([])
  const [numPlayers, setNumPlayers] = useState('')
  const [testMicResult, setTestMicResult] = useState(null)
  const [testMicLoading, setTestMicLoading] = useState(false)
  const fileInputRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const error = uploadError || serverError

  const stopListening = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch (_) {}
      recorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setListening(false)
  }, [])

  const lastTranscript = transcriptLog.length > 0 ? transcriptLog[transcriptLog.length - 1] : ''

  const startListening = useCallback(async () => {
    setUploadError(null)
    setTranscriptLog([])
    if (!navigator.mediaDevices?.getUserMedia) {
      setUploadError('Microphone access not supported')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return
        try {
          const data = await submitVoiceBettingChunk(e.data)
          if (data.ok) {
            if (Array.isArray(data.all_actions)) onActionsUpdated?.(data.all_actions)
            const t = (data.transcript || '').trim()
            if (t) setTranscriptLog((prev) => [...prev.slice(-19), t])
          } else if (data.error) {
            setUploadError(data.error)
          }
        } catch (err) {
          setUploadError(err.message || 'Chunk failed')
        }
      }
      recorder.onstop = () => {}
      recorder.start(CHUNK_MS)
      setListening(true)
    } catch (err) {
      setUploadError(err.message || 'Microphone access denied')
    }
  }, [onActionsUpdated])

  const toggleLive = () => {
    if (listening) stopListening()
    else startListening()
  }

  useEffect(() => {
    return () => {
      if (recorderRef.current || streamRef.current) {
        if (recorderRef.current?.state !== 'inactive') try { recorderRef.current.stop() } catch (_) {}
        streamRef.current?.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setLoading(true)
    try {
      const num = numPlayers.trim() ? parseInt(numPlayers, 10) : null
      const data = await submitVoiceBettingAudio(file, num)
      if (data.ok && Array.isArray(data.actions)) {
        onActionsUpdated?.(data.actions)
      } else {
        setUploadError(data.error || 'Processing failed')
        onActionsUpdated?.([])
      }
    } catch (err) {
      setUploadError(err.message || 'Upload failed')
      onActionsUpdated?.([])
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleTestMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setTestMicResult({ ok: false, error: 'Microphone not supported' })
      return
    }
    setTestMicResult(null)
    setTestMicLoading(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const blobPromise = new Promise((resolve) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) resolve(e.data)
          else resolve(null)
        }
        recorder.onstop = () => stream.getTracks().forEach((t) => t.stop())
      })
      recorder.start(3000)
      await new Promise((r) => setTimeout(r, 3200))
      recorder.stop()
      const blob = await blobPromise
      if (!blob) {
        setTestMicResult({ ok: false, error: 'No audio captured (mic muted or silent?)' })
        setTestMicLoading(false)
        return
      }
      const data = await submitVoiceChunkTest(blob)
      setTestMicResult(data)
    } catch (err) {
      setTestMicResult({ ok: false, error: err.message || 'Test failed' })
    } finally {
      setTestMicLoading(false)
    }
  }, [])

  if (!voiceBettingAvailable) {
    return (
      <div className="section voice-betting-section">
        <h2>Voice betting</h2>
        <p className="voice-betting-hint">
          Install with the <strong>same Python</strong> that runs the backend:{' '}
          <code>python -m pip install -r requirements-voice.txt</code>. Set{' '}
          <code>HUGGINGFACE_HUB_TOKEN</code>. Accept license at pyannote/speaker-diarization-3.1.
        </p>
        <p className="voice-betting-hint">
          Check the backend terminal when you start the app — it prints which Python it uses and whether faster_whisper loaded.
        </p>
        <button
          type="button"
          className="btn btn-voice-live"
          onClick={handleTestMic}
          disabled={testMicLoading}
        >
          {testMicLoading ? 'Recording 3 s…' : 'Test mic (no transcription)'}
        </button>
        {testMicResult && (
          <div className={`voice-test-result ${testMicResult.ok ? 'ok' : 'error'}`}>
            {testMicResult.ok ? (
              <span>{testMicResult.message || `Server received ${testMicResult.chunk_kb} KB`}</span>
            ) : (
              <span>{testMicResult.error}</span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="section voice-betting-section">
      <h2>Voice betting</h2>
      <p className="voice-betting-hint">
        Say &quot;call&quot;, &quot;raise 50&quot;, &quot;fold&quot;, etc. — use live mic or upload a file.
      </p>
      <div className="voice-betting-upload">
        <button
          type="button"
          className={`btn ${listening ? 'btn-voice-stop' : 'btn-voice-live'}`}
          onClick={toggleLive}
          disabled={loading}
        >
          {listening ? 'Stop listening' : 'Start listening'}
        </button>
        <span className="voice-betting-or">or</span>
        <label className="voice-betting-label">
          <span>Max players (optional)</span>
          <input
            type="number"
            min="2"
            max="10"
            placeholder="e.g. 6"
            value={numPlayers}
            onChange={(e) => setNumPlayers(e.target.value)}
            className="voice-betting-num-input"
            disabled={listening}
          />
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.ogg,.m4a,.flac,.webm,audio/*"
          onChange={handleFile}
          disabled={loading || listening}
          className="voice-betting-file-input hidden-file-input"
          aria-hidden
        />
        <button
          type="button"
          className="btn btn-voice-upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || listening}
        >
          {loading ? 'Processing…' : 'Upload audio'}
        </button>
      </div>
      {listening && (
        <p className="voice-betting-live-hint">Listening… Sending chunks every ~3 s. Say anything — it will type out what you said.</p>
      )}
      {(listening || transcriptLog.length > 0) && (
        <div className="voice-transcript-box">
          <h3>What you said</h3>
          {lastTranscript ? (
            <p className="voice-transcript-last">&quot;{lastTranscript}&quot;</p>
          ) : listening ? (
            <p className="voice-transcript-placeholder">Waiting for speech…</p>
          ) : null}
          {transcriptLog.length > 1 && (
            <ul className="voice-transcript-log">
              {transcriptLog.map((t, i) => (
                <li key={i}>&quot;{t}&quot;</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="voice-betting-error">{error}</p>}
      {actions.length > 0 && (
        <div className="voice-betting-list">
          <h3>Detected actions</h3>
          <ul>
            {actions.map((a, i) => (
              <li key={i} className="voice-betting-item">
                <span className="voice-betting-player">
                  {a.speaker_id === 'live' ? 'You' : `Player ${a.player_index}`}
                </span>
                <span className="voice-betting-action">{a.action}</span>
                {a.amount != null && (
                  <span className="voice-betting-amount">{formatMoney(a.amount)}</span>
                )}
                {a.raw_text && (
                  <span className="voice-betting-text">&quot;{a.raw_text}&quot;</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
