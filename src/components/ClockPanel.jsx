import { useState, useEffect } from 'react'
import './ClockPanel.css'

function fmtMs(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
}

export default function ClockPanel({ clockState, onClockIn, onClockOut, todayMs, activeTask }) {
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
      {isClockedIn && (
        <div className="clock-status-bar">
          <div className="clock-pulse-ring" />
          <div className="clock-status-text">
            <span className="clock-status-label">Working</span>
            {activeTask && <span className="clock-active-task">on: {activeTask.title.slice(0, 30)}{activeTask.title.length > 30 ? '…' : ''}</span>}
          </div>
        </div>
      )}
      <div className="clock-right">
        <div className="clock-times">
          <div className="clock-session-time">
            {isClockedIn ? (
              <><span className="clock-session-label">Session</span><span className="clock-session-val running">{fmtMs(elapsed)}</span></>
            ) : (
              <span className="clock-session-label">Not clocked in</span>
            )}
          </div>
          <div className="clock-today-time">
            <span className="clock-session-label">Today</span>
            <span className="clock-session-val">{fmtMs(todayMs)}</span>
          </div>
        </div>
        <button
          className={`clock-btn ${isClockedIn ? 'out' : 'in'}`}
          onClick={isClockedIn ? onClockOut : onClockIn}
        >
          {isClockedIn ? (
            <><span className="clock-btn-dot out-dot" />Clock Out</>
          ) : (
            <><span className="clock-btn-dot in-dot" />Clock In</>
          )}
        </button>
      </div>
    </div>
  )
}
