import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { getCardImage } from '../utils/cardImages'
import './HoleDisplay.css'

export default function HoleDisplay({ holeCards = [] }) {
  const slots = [holeCards[0] || null, holeCards[1] || null]

  return (
    <Stack direction="row" spacing={0.5} className="hole-display">
      {slots.map((card, i) => {
        const img = card ? getCardImage(card) : null
        return (
          <Box key={i} className={`hole-slot${card ? ' hole-slot--filled' : ''}`}>
            {img ? (
              <img src={img} alt={card} className="hole-slot-img" />
            ) : card ? (
              <span className="hole-slot-label">{card}</span>
            ) : null}
          </Box>
        )
      })}
    </Stack>
  )
}
