/**
 * Reusable hook for voice-based poker commands.
 * Manages mic recording with overlapping lanes, sends chunks to Dedalus for
 * transcription, parses poker commands, and calls onCommand(cmd) when detected.
 *
 * Usage:
 *   const voice = useVoiceInput({ onCommand: (cmd) => { ... } })
 *   // voice.listening, voice.transcript, voice.voiceStatus, voice.voiceError
 *   // voice.startListening(), voice.stopListening()
 */
import { useState, useRef, useCallback } from 'react'
import { transcribeChunk } from '../api/backend'
import { parseVoiceCommand } from '../utils/voiceParser'

export default function useVoiceInput({ onCommand }) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voiceError, setVoiceError] = useState('')

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const stoppedRef = useRef(false)
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand // always point to latest callback

  const stopListening = useCallback(() => {
    setListening(false)
    stoppedRef.current = true
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
  }, [])

  const startListening = useCallback(async () => {
    setTranscript('')
    setVoiceError('')
    setVoiceStatus('Starting mic…')
    stoppedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setListening(true)
      setVoiceStatus('Listening…')

      // Deduplication: prevent overlapping lanes from executing the same command twice
      const lastCmd = { key: '', time: 0 }
      const DEDUP_MS = 4000
      const CHUNK_MS = 3000
      const STAGGER_MS = 1500

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const startChunk = (lane) => {
        if (stoppedRef.current) return
        const mr = new MediaRecorder(stream, { mimeType })
        const chunks = []
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data)
        }
        mr.onstop = async () => {
          if (stoppedRef.current || chunks.length === 0) return
          const blob = new Blob(chunks, { type: mimeType })
          setVoiceStatus(`Sending ${(blob.size / 1024).toFixed(1)} KB…`)
          try {
            const result = await transcribeChunk(blob)
            if (stoppedRef.current) return
            if (result && result.ok && result.text) {
              setTranscript((prev) => (prev ? prev + ' ' + result.text : result.text))
              setVoiceStatus(`Heard: "${result.text}"`)
              const cmd = parseVoiceCommand(result.text)
              if (cmd) {
                const cmdKey = `${cmd.action}_${cmd.amount ?? ''}`
                const now = Date.now()
                if (cmdKey === lastCmd.key && now - lastCmd.time < DEDUP_MS) {
                  setVoiceStatus(`Heard: "${result.text}" (already executed)`)
                } else {
                  lastCmd.key = cmdKey
                  lastCmd.time = now
                  setVoiceStatus(
                    `Executing: ${cmd.action}${cmd.amount != null ? ' ' + cmd.amount : ''}`
                  )
                  onCommandRef.current(cmd)
                }
              } else {
                setVoiceStatus(
                  `Heard: "${result.text}" (no command detected — say call/fold/raise/check)`
                )
              }
            } else if (result && !result.ok) {
              setVoiceError(result.error || 'Transcription failed')
              setVoiceStatus('Error — see below')
            } else {
              setVoiceStatus('Listening… (no speech detected)')
            }
          } catch (err) {
            if (!stoppedRef.current) {
              setVoiceError(err.message)
              setVoiceStatus('Error — see below')
            }
          }
        }
        mediaRecorderRef.current = mr
        mr.start()
        setTimeout(() => {
          if (mr.state === 'recording') mr.stop()
          if (!stoppedRef.current) startChunk(lane)
        }, CHUNK_MS)
      }

      // Two overlapping recording lanes staggered by half the chunk duration
      startChunk('A')
      setTimeout(() => {
        if (!stoppedRef.current) startChunk('B')
      }, STAGGER_MS)
    } catch (err) {
      setVoiceError('Mic access denied: ' + err.message)
      setListening(false)
    }
  }, [])

  return {
    listening,
    transcript,
    voiceStatus,
    voiceError,
    setVoiceError,
    startListening,
    stopListening,
  }
}
