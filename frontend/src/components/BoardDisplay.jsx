import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { getCardImage } from '../utils/cardImages'
import './BoardDisplay.css'

export default function BoardDisplay({ flopCards = [], turnCard = null, riverCard = null }) {
  const slots = [flopCards[0] || null, flopCards[1] || null, flopCards[2] || null, turnCard, riverCard]

  return (
    <Stack direction="row" spacing={0.75} className="board-display">
      {slots.map((card, i) => {
        const img = card ? getCardImage(card) : null
        return (
          <Box key={i} className={`board-slot${card ? ' board-slot--filled' : ''}`}>
            {img ? (
              <img src={img} alt={card} className="board-slot-img" />
            ) : card ? (
              <span className="board-slot-label">{card}</span>
            ) : null}
          </Box>
        )
      })}
    </Stack>
  )
}
