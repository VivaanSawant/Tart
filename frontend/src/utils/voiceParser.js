/**
 * Shared voice command parsing utilities for poker.
 * Used by both TableSimulatorView and BotGameView.
 */

export const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100,
}

export function spokenToNumber(str) {
  const s = str.replace(/\$/g, '').toLowerCase().trim()
  if (!s) return null
  const direct = parseFloat(s)
  if (!isNaN(direct)) return direct
  let total = 0
  const words = s.split(/\s+/)
  for (const w of words) {
    const n = WORD_TO_NUM[w]
    if (n !== undefined) {
      if (n === 100) total = total === 0 ? 100 : total * 100
      else total += n
    }
  }
  return total || null
}

/**
 * Parse a voice transcript into a poker command.
 * Returns { action: string, amount: number|null } or null if no command detected.
 */
export function parseVoiceCommand(transcript) {
  if (!transcript) return null
  // Strip currency symbols, sentence-ending periods (preserve decimal points), and other punctuation
  const t = transcript.toLowerCase()
    .replace(/\$/g, '')             // strip dollar signs
    .replace(/\.(?=\s|$)/g, '')     // strip only sentence-ending periods, keep decimal points like 1.50
    .replace(/[,!?;:'"]/g, '')      // strip other punctuation
    .trim()

  // Reject if too short (noise) or too long (conversation, not a command)
  if (t.length < 3 || t.split(/\s+/).length > 6) return null

  // STRICT: the transcript must START with the command word (optional "I" / "I'll" prefix).

  // --- CALL (with optional amount) ---
  const callMatch = t.match(/^(?:i\s+|i'll\s+)?call(?:\s+(.+))?$/)
  if (callMatch) {
    if (!callMatch[1]) return { action: 'call', amount: null }
    const rest = callMatch[1]
    const isCents = /\bcents?\b/.test(rest)
    const numPart = rest.replace(/\bcents?\b|\bdollars?\b/g, '').trim()
    let amount = spokenToNumber(numPart)
    if (amount != null && isCents) amount = amount / 100
    return { action: 'call', amount }
  }

  // --- RAISE (with amount) ---
  const raiseMatch = t.match(/^(?:i\s+|i'll\s+)?raise\s+(?:to\s+)?(.+)$/)
  if (raiseMatch) {
    const rest = raiseMatch[1]
    const isCents = /\bcents?\b/.test(rest)
    const numPart = rest.replace(/\bcents?\b|\bdollars?\b/g, '').trim()
    let amount = spokenToNumber(numPart)
    if (amount != null && isCents) amount = amount / 100
    return { action: 'raise', amount }
  }

  // --- FOLD ---
  if (/^(?:i\s+|i'll\s+)?fold$/.test(t)) return { action: 'fold' }

  // --- CHECK ---
  if (/^(?:i\s+|i'll\s+)?check$/.test(t)) return { action: 'check' }

  // --- ALL IN ---
  if (/^(?:i'm\s+|i\s+am\s+|go\s+)?all[\s-]?in$/.test(t)) return { action: 'allin' }

  return null
}
