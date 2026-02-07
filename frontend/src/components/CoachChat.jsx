import { useState, useRef, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import SendIcon from '@mui/icons-material/Send'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import PersonIcon from '@mui/icons-material/Person'
import { sendCoachMessage } from '../api/backend'

const SUGGESTED_PROMPTS = [
  'What are my biggest leaks?',
  'Am I bluffing too much?',
  'How can I improve on the river?',
  'What does my aggression say about me?',
  'Am I folding too often?',
  'Give me a summary of my play style',
]

export default function CoachChat({ profile, moves }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const send = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text.trim() }
    if (!userMsg.content) return

    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await sendCoachMessage(nextMessages, profile, moves)
      if (res?.ok && res.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Sorry, I couldn't process that. ${res?.error || ''}` },
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }, [messages, profile, moves])

  const handleSubmit = (e) => {
    e.preventDefault()
    send(input)
  }

  const handleSuggestion = (text) => {
    send(text)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'linear-gradient(145deg, rgba(22,33,62,0.6) 0%, rgba(15,23,41,0.7) 100%)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.15)',
          flexShrink: 0,
        }}
      >
        <SmartToyIcon sx={{ fontSize: 20, color: '#3498db' }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#eee' }}>
          Poker Coach
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: '#666', ml: 'auto' }}>
          Powered by Dedalus
        </Typography>
      </Box>

      {/* Messages area */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: 2,
          py: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.2,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: 3 },
        }}
      >
        {messages.length === 0 && !loading && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <SmartToyIcon sx={{ fontSize: 40, color: 'rgba(52,152,219,0.3)', mb: 1 }} />
            <Typography sx={{ fontSize: '0.9rem', color: '#aaa', mb: 0.5 }}>
              Ask me anything about your play
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: '#666', mb: 2 }}>
              I can see your full move log and player profile
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, justifyContent: 'center' }}>
              {SUGGESTED_PROMPTS.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  size="small"
                  onClick={() => handleSuggestion(p)}
                  sx={{
                    fontSize: '0.7rem',
                    height: 26,
                    cursor: 'pointer',
                    bgcolor: 'rgba(52,152,219,0.1)',
                    color: '#3498db',
                    border: '1px solid rgba(52,152,219,0.2)',
                    '&:hover': { bgcolor: 'rgba(52,152,219,0.2)' },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {messages.map((msg, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            }}
          >
            {/* Avatar */}
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                mt: 0.3,
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #2ecc71, #27ae60)'
                  : 'linear-gradient(135deg, #3498db, #2980b9)',
              }}
            >
              {msg.role === 'user' ? (
                <PersonIcon sx={{ fontSize: 16, color: '#fff' }} />
              ) : (
                <SmartToyIcon sx={{ fontSize: 16, color: '#fff' }} />
              )}
            </Box>

            {/* Bubble */}
            <Box
              sx={{
                maxWidth: '80%',
                px: 1.5,
                py: 1,
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user'
                  ? 'rgba(46,204,113,0.12)'
                  : 'rgba(52,152,219,0.08)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(46,204,113,0.2)' : 'rgba(52,152,219,0.15)'}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.82rem',
                  color: '#ddd',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </Typography>
            </Box>
          </Box>
        ))}

        {loading && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: 'linear-gradient(135deg, #3498db, #2980b9)',
              }}
            >
              <SmartToyIcon sx={{ fontSize: 16, color: '#fff' }} />
            </Box>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: '14px 14px 14px 4px',
                background: 'rgba(52,152,219,0.08)',
                border: '1px solid rgba(52,152,219,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={14} sx={{ color: '#3498db' }} />
              <Typography sx={{ fontSize: '0.78rem', color: '#888' }}>Thinking...</Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Input bar */}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          px: 1.5,
          py: 1,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.1)',
          flexShrink: 0,
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Ask about your play style..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoComplete="off"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    type="submit"
                    size="small"
                    disabled={loading || !input.trim()}
                    sx={{ color: '#3498db' }}
                  >
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                fontSize: '0.82rem',
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.04)',
                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                '&:hover fieldset': { borderColor: 'rgba(52,152,219,0.3)' },
                '&.Mui-focused fieldset': { borderColor: 'rgba(52,152,219,0.5)' },
              },
            },
          }}
        />
      </Box>
    </Box>
  )
}
