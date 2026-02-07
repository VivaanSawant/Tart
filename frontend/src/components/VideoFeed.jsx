import Paper from '@mui/material/Paper'

export default function VideoFeed({ src }) {
  return (
    <Paper sx={{ borderRadius: '8px', overflow: 'hidden', bgcolor: '#1e1e1e', height: '100%' }}>
      <img
        id="video"
        src={src}
        alt="Live feed"
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </Paper>
  )
}
