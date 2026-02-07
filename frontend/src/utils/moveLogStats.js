/**
 * Compute player aggression (0-100) from move log.
 * Same formula as MoveLog: (raises + 0.5 * calls) / total * 100
 */
export function computePlayerAggression(moves = []) {
  if (!moves.length) return 50
  const total = moves.length
  const byAction = { call: 0, raise: 0 }
  moves.forEach((m) => {
    const a = (m.action || '').toLowerCase()
    if (a === 'call') byAction.call++
    else if (a === 'raise') byAction.raise++
  })
  return Math.round(((byAction.raise + byAction.call * 0.5) / total) * 100)
}
