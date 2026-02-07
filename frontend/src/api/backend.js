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

export async function listCameras() {
  return jsonFetch('/api/cameras')
}

export async function switchCamera(index) {
  return jsonFetch('/api/cameras', {
    method: 'POST',
    body: JSON.stringify({ index }),
  })
}
