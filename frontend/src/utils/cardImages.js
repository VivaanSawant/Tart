/**
 * Maps short card strings (e.g. "As", "10h", "Jc") to SVG card images.
 */

// Eagerly import all card SVGs
const svgModules = import.meta.glob('../assets/svg-cards/*.svg', { eager: true })

// Build a lookup: filename (without path/extension) -> module default (URL)
const svgByName = {}
for (const [path, mod] of Object.entries(svgModules)) {
  const filename = path.split('/').pop().replace('.svg', '')
  svgByName[filename] = mod.default
}

const RANK_MAP = {
  A: 'ace',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  T: '10',
  J: 'jack',
  Q: 'queen',
  K: 'king',
}

const SUIT_MAP = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
}

/**
 * Given a card string like "As", "10h", "Jc", "6d",
 * returns the URL to the corresponding SVG, or null if not found.
 */
export function getCardImage(cardStr) {
  if (!cardStr || typeof cardStr !== 'string') return null

  const s = cardStr.trim()
  let rank, suit

  if (s.startsWith('10') && s.length >= 3) {
    rank = '10'
    suit = s[2]
  } else if (s.length >= 2) {
    rank = s[0]
    suit = s[1]
  } else {
    return null
  }

  const rankName = RANK_MAP[rank]
  const suitName = SUIT_MAP[suit]
  if (!rankName || !suitName) return null

  const key = `${rankName}_of_${suitName}`
  return svgByName[key] || null
}
