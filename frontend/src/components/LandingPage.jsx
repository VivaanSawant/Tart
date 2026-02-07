import { useCallback, useEffect, useRef } from 'react'
import './LandingPage.css'

const BANNER_ASCII = String.raw`
 _______            __                                  _______   __                               
/       \          /  |                                /       \ /  |                              
$$$$$$$  | ______  $$ |   __   ______    ______        $$$$$$$  |$$ |  ______   __    __   ______  
$$ |__$$ |/      \ $$ |  /  | /      \  /      \       $$ |__$$ |$$ | /      \ /  |  /  | /      \ 
$$    $$//$$$$$$  |$$ |_/$$/ /$$$$$$  |/$$$$$$  |      $$    $$/ $$ | $$$$$$  |$$ |  $$ | $$$$$$  |
$$$$$$$/ $$ |  $$ |$$   $$<  $$    $$ |$$ |  $$/       $$$$$$$/  $$ | /    $$ |$$ |  $$ | /    $$ |
$$ |     $$ \__$$ |$$$$$$  \ $$$$$$$$/ $$ |            $$ |      $$ |/$$$$$$$ |$$ \__$$ |/$$$$$$$ |
$$ |     $$    $$/ $$ | $$  |$$       |$$ |            $$ |      $$ |$$    $$ |$$    $$ |$$    $$ |
$$/       $$$$$$/  $$/   $$/  $$$$$$$/ $$/             $$/       $$/  $$$$$$$/  $$$$$$$ | $$$$$$$/ 
                                                                               /  \__$$ |          
                                                                               $$    $$/           
                                                                                $$$$$$/            
`

const SPADE_ASCII = `                                         
                      #                      
                     ###                     
                    #####                    
                  #########                  
                 ###########                 
               ###############               
            #####################            
          #########################          
        #############################        
       ###############################       
      #################################      
      #################################      
      #################################      
       ###############################       
         ###########################         
            #####    ###    #####            
                    #####                    
                   #######                   
                  #########                  
                #############                            
`

// --- Parse grids ---
function parseGrid(ascii) {
  const rawLines = ascii.split('\n')
  const maxCols = Math.max(...rawLines.map((l) => l.length))
  // Pad all lines to maxCols to keep original centering intact
  const grid = rawLines.map((line) => {
    const chars = [...line]
    while (chars.length < maxCols) chars.push(' ')
    return chars
  })
  return { lines: rawLines, numRows: rawLines.length, maxCols, grid }
}

const BANNER = parseGrid(BANNER_ASCII)
const SPADE = parseGrid(SPADE_ASCII)

const BANNER_INITIAL = BANNER.grid.map((r) => r.join('')).join('\n')
const SPADE_INITIAL = SPADE.grid.map((r) => r.join('')).join('\n')

const TRAIL_RADIUS = 1
const RESTORE_MIN_MS = 390
const RESTORE_MAX_MS = 910

const GLITCH_CHARS = ['@', '/', '[', '.', ']']

// Pre-compute list of all # positions for glitch picking
const HASH_POSITIONS = []
SPADE.grid.forEach((row, r) => {
  row.forEach((ch, c) => {
    if (ch === '#') HASH_POSITIONS.push([r, c])
  })
})

// Generic trail hook helpers
function useTrailGrid(parsed) {
  const preRef = useRef(null)
  const gridRef = useRef(parsed.grid.map((row) => [...row]))
  const timersRef = useRef({})
  const rafRef = useRef(null)

  const renderGrid = useCallback(() => {
    if (preRef.current) {
      preRef.current.textContent = gridRef.current
        .map((row) => row.join(''))
        .join('\n')
    }
    rafRef.current = null
  }, [])

  const scheduleRender = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(renderGrid)
    }
  }, [renderGrid])

  const restoreCell = useCallback(
    (r, c) => {
      gridRef.current[r][c] = parsed.grid[r][c]
      delete timersRef.current[`${r},${c}`]
      scheduleRender()
    },
    [scheduleRender, parsed.grid]
  )

  const handleMouseMove = useCallback(
    (e) => {
      const pre = preRef.current
      if (!pre) return

      const rect = pre.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const charW = rect.width / parsed.maxCols
      const charH = rect.height / parsed.numRows

      const col = Math.floor(x / charW)
      const row = Math.floor(y / charH)

      let changed = false

      for (let dr = -TRAIL_RADIUS; dr <= TRAIL_RADIUS; dr++) {
        for (let dc = -TRAIL_RADIUS; dc <= TRAIL_RADIUS; dc++) {
          if (dr * dr + dc * dc > TRAIL_RADIUS * TRAIL_RADIUS) continue
          const r = row + dr
          const c = col + dc
          if (r < 0 || r >= parsed.numRows || c < 0 || c >= parsed.maxCols) continue
          if (parsed.grid[r][c] === ' ') continue
          if (gridRef.current[r][c] === ' ') continue

          gridRef.current[r][c] = ' '
          changed = true

          const key = `${r},${c}`
          if (timersRef.current[key]) clearTimeout(timersRef.current[key])
          const delay =
            RESTORE_MIN_MS +
            Math.random() * (RESTORE_MAX_MS - RESTORE_MIN_MS)
          timersRef.current[key] = setTimeout(() => restoreCell(r, c), delay)
        }
      }

      if (changed) scheduleRender()
    },
    [scheduleRender, restoreCell, parsed]
  )

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { preRef, gridRef, handleMouseMove, scheduleRender }
}

export default function LandingPage({ onEnter }) {
  const banner = useTrailGrid(BANNER)
  const spade = useTrailGrid(SPADE)
  const glitchTimersRef = useRef({})

  // Glitch effect on spade
  const spadeGridRef = spade.gridRef
  const spadeScheduleRender = spade.scheduleRender

  useEffect(() => {
    const glitchTick = () => {
      const count = 2 + Math.floor(Math.random() * 4)
      let changed = false

      for (let i = 0; i < count; i++) {
        const [r, c] = HASH_POSITIONS[Math.floor(Math.random() * HASH_POSITIONS.length)]
        if (spadeGridRef.current[r][c] !== '#') continue

        const glyph = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        spadeGridRef.current[r][c] = glyph
        changed = true

        const key = `g${r},${c}`
        if (glitchTimersRef.current[key]) clearTimeout(glitchTimersRef.current[key])
        const delay = 50 + Math.random() * 150
        glitchTimersRef.current[key] = setTimeout(() => {
          if (spadeGridRef.current[r][c] === glyph) {
            spadeGridRef.current[r][c] = '#'
            spadeScheduleRender()
          }
          delete glitchTimersRef.current[key]
        }, delay)
      }

      if (changed) spadeScheduleRender()
    }

    const id = setInterval(glitchTick, 150)
    return () => {
      clearInterval(id)
      Object.values(glitchTimersRef.current).forEach(clearTimeout)
    }
  }, [spadeGridRef, spadeScheduleRender])

  return (
    <div className="landing">
      <div className="landing-content">
        <div className="landing-banner">
          <pre
            ref={banner.preRef}
            className="landing-ascii banner-ascii"
            onMouseMove={banner.handleMouseMove}
          >
            {BANNER_INITIAL}
          </pre>
        </div>

        <div
          className="landing-spade"
          onClick={onEnter}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
        >
          <pre
            ref={spade.preRef}
            className="landing-ascii spade-ascii"
            onMouseMove={spade.handleMouseMove}
          >
            {SPADE_INITIAL}
          </pre>
        </div>

        <p className="landing-click-hint">Click to start</p>
      </div>
    </div>
  )
}
