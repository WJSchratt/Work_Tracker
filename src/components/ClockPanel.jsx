import { useState, useEffect } from 'react'
import './ClockPanel.css'

function fmtMs(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
}

export default function ClockPanel({ clockState, onClockIn, onClockOut, todayMs }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!clockState?.clockedIn) { setElapsed(0); return }
    const tick = () => setElapsed(Date.now() - new Date(clockState.clockIn).getTime())
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [clockState])

  const isClockedIn = clockState?.clockedIn

  return (
    <div className="clock-panel">
      <div className="clock-info">
        <div className="clock-today">Today: {fmtMs(todayMs + elapsed)}</div>
        {isClockedIn && <div className="clock-session">Session: {fmtMs(elapsed)}</div>}
      </div>
      <button className={`clock-btn ${isClockedIn ? 'out' : 'in'}`} onClick={isClockedIn ? onClockOut : onClockIn}>
        <span className="clock-dot" />
        {isClockedIn ? 'Clock Out' : 'Clock In'}
      </button>
    </div>
  )
}
