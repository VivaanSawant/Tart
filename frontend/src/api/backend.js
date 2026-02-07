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

export async function fetchState(opts = {}) {
  const params = new URLSearchParams()
  if (opts.train) params.set('train', '1')
  if (opts.train && opts.heroAggression != null) params.set('hero_aggression', String(opts.heroAggression))
  const qs = params.toString() ? `?${params.toString()}` : ''
  return jsonFetch(`/api/state${qs}`)
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

export async function confirmBetting(action, amount = 0) {
  return jsonFetch('/api/confirm_betting', {
    method: 'POST',
    body: JSON.stringify({ action, amount }),
  })
}

export async function updatePotState(payload) {
  return jsonFetch('/api/pot', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listCameras() {
  return jsonFetch('/api/cameras')
}

export async function switchCamera(index) {
  return jsonFetch('/api/cameras', {
    method: 'POST',
    body: JSON.stringify({ index }),
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

export async function tableSetHero(seat) {
  return jsonFetch('/api/table/set_hero', {
    method: 'POST',
    body: JSON.stringify({ seat }),
  })
}

export async function tableReset(numPlayers = 6) {
  return jsonFetch('/api/table/reset', {
    method: 'POST',
    body: JSON.stringify({ num_players: numPlayers }),
  })
}

export async function getPlayStyle() {
  return jsonFetch('/api/play_style')
}

export async function setPlayStyle(aggression) {
  return jsonFetch('/api/play_style', {
    method: 'POST',
    body: JSON.stringify({ aggression }),
  })
}

// Dedalus audio transcription
export async function transcribeChunk(blob) {
  const fd = new FormData()
  fd.append('chunk', blob, 'chunk.webm')
  const res = await fetch('/api/transcribe_chunk', { method: 'POST', body: fd })
  if (!res.ok) return null
  return res.json()
}