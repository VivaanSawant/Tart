import { getCardImage } from '../utils/cardImages'
import './HoleDisplay.css'

export default function HoleDisplay({ holeCards = [] }) {
  const slots = [holeCards[0] || null, holeCards[1] || null]

  return (
    <div className="hole-display">
      {slots.map((card, i) => {
        const img = card ? getCardImage(card) : null
        return (
          <div key={i} className={`hole-slot${card ? ' hole-slot--filled' : ''}`}>
            {img ? (
              <img src={img} alt={card} className="hole-slot-img" />
            ) : card ? (
              <span className="hole-slot-label">{card}</span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
