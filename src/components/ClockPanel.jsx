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
      <div className="clock-times">
        <span className="clock-session-label">Today</span>
        <span className={`clock-session-val ${isClockedIn ? 'running' : ''}`}>{fmtMs(todayMs)}</span>
      </div>
      <button className={`clock-btn ${isClockedIn ? 'out' : 'in'}`} onClick={isClockedIn ? onClockOut : onClockIn}>
        {isClockedIn ? <><span className="clock-btn-dot out-dot" />Clock Out</> : <><span className="clock-btn-dot in-dot" />Clock In</>}
      </button>
    </div>
  )
}
