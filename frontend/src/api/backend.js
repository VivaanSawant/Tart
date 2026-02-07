async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    return null
  }
  return res.json()
}

export async function fetchState() {
  return jsonFetch('/api/state')
}

export async function lockHole(card) {
  return jsonFetch('/api/lock_hole', {
    method: 'POST',
    body: JSON.stringify({ card }),
  })
}

export async function lockHoleAll() {
  return jsonFetch('/api/lock_hole_all', { method: 'POST' })
}

export async function clearHand() {
  return jsonFetch('/api/clear', { method: 'POST' })
}

export async function confirmBetting(street, opponent, hero) {
  return jsonFetch('/api/confirm_betting', {
    method: 'POST',
    body: JSON.stringify({ street, opponent, hero }),
  })
}

export async function updatePotState(payload) {
  return jsonFetch('/api/pot', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Table simulator
export async function fetchTableState() {
  return jsonFetch('/api/table/state')
}

export async function tableAction(seat, action, amount = 0, isHeroActing = false) {
  return jsonFetch('/api/table/action', {
    method: 'POST',
    body: JSON.stringify({ seat, action, amount, is_hero_acting: isHeroActing }),
  })
}

export async function tableReset(numPlayers = 6) {
  return jsonFetch('/api/table/reset', {
    method: 'POST',
    body: JSON.stringify({ num_players: numPlayers }),
  })
}
