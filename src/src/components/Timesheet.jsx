import { useState } from 'react'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday, parseISO, addWeeks, subWeeks } from 'date-fns'
import './Timesheet.css'

function fmtMs(ms) {
  if (!ms || ms < 1000) return '0h 0m'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtTime(iso) {
  try { return format(parseISO(iso), 'h:mm a') } catch { return '—' }
}

function toISOLocal(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}`).toISOString()
}

function parseDuration(clockIn, clockOut) {
  try {
    return new Date(clockOut).getTime() - new Date(clockIn).getTime()
  } catch { return 0 }
}

export default function Timesheet({ sessions }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const [addingDay, setAddingDay] = useState(null)
  const [newIn, setNewIn] = useState('')
  const [newOut, setNewOut] = useState('')

  const baseDate = weekOffset === 0 ? new Date()
    : weekOffset > 0 ? addWeeks(new Date(), weekOffset)
    : subWeeks(new Date(), Math.abs(weekOffset))

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`

  const sessionsByDay = {}
  sessions.forEach(s => {
    const d = s.date || (s.clockIn ? format(parseISO(s.clockIn), 'yyyy-MM-dd') : null)
    if (!d) return
    if (!sessionsByDay[d]) sessionsByDay[d] = []
    sessionsByDay[d].push(s)
  })

  const weekTotalMs = days.reduce((acc, day) => {
    const key = format(day, 'yyyy-MM-dd')
    return acc + (sessionsByDay[key] || []).reduce((a, s) => a + (s.durationMs || 0), 0)
  }, 0)

  const startEdit = (s) => {
    setEditingId(s.id)
    setEditIn(s.clockIn ? format(parseISO(s.clockIn), "HH:mm") : '')
    setEditOut(s.clockOut ? format(parseISO(s.clockOut), "HH:mm") : '')
  }

  const saveEdit = async (s) => {
    const dateStr = s.date || format(parseISO(s.clockIn), 'yyyy-MM-dd')
    const newClockIn = toISOLocal(dateStr, editIn)
    const newClockOut = toISOLocal(dateStr, editOut)
    const durationMs = parseDuration(newClockIn, newClockOut)
    await updateDoc(doc(db, 'sessions', s.id), {
      clockIn: newClockIn, clockOut: newClockOut, durationMs, date: dateStr
    })
    setEditingId(null)
  }

  const deleteSession = async (id) => {
    if (!window.confirm('Delete this session?')) return
    await deleteDoc(doc(db, 'sessions', id))
  }

  const addSession = async (day) => {
    if (!newIn || !newOut) return
    const dateStr = format(day, 'yyyy-MM-dd')
    const clockIn = toISOLocal(dateStr, newIn)
    const clockOut = toISOLocal(dateStr, newOut)
    const durationMs = parseDuration(clockIn, clockOut)
    await addDoc(collection(db, 'sessions'), { clockIn, clockOut, date: dateStr, durationMs })
    setAddingDay(null); setNewIn(''); setNewOut('')
  }

  return (
    <div className="timesheet">
      <div className="ts-header">
        <button className="ts-nav" onClick={() => setWeekOffset(w => w - 1)}>← Prev</button>
        <div className="ts-week-label">
          {weekLabel}
          {weekOffset !== 0 && (
            <button className="ts-today-btn" onClick={() => setWeekOffset(0)}>This Week</button>
          )}
        </div>
        <button className="ts-nav" onClick={() => setWeekOffset(w => w + 1)}>Next →</button>
      </div>

      <div className="ts-total">
        <span className="ts-total-label">Week Total</span>
        <span className="ts-total-val">{fmtMs(weekTotalMs)}</span>
      </div>

      <div className="ts-days">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd')
          const daySessions = sessionsByDay[key] || []
          const dayMs = daySessions.reduce((a, s) => a + (s.durationMs || 0), 0)
          const isWeekend = [0, 6].includes(day.getDay())
          const isAdding = addingDay === key

          return (
            <div key={key} className={`ts-day ${isToday(day) ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}>
              <div className="ts-day-header">
                <div className="ts-day-name">{format(day, 'EEE')}</div>
                <div className="ts-day-date">{format(day, 'MMM d')}</div>
                <div className="ts-day-total">{dayMs > 0 ? fmtMs(dayMs) : '—'}</div>
              </div>
              <div className="ts-sessions">
                {daySessions.length === 0 && !isAdding && (
                  <div className="ts-no-sessions">No sessions</div>
                )}
                {daySessions.map((s, i) => (
                  <div key={i} className="ts-session">
                    {editingId === s.id ? (
                      <div className="ts-edit">
                        <input type="time" value={editIn} onChange={e => setEditIn(e.target.value)} className="ts-time-input" />
                        <span className="ts-session-sep">→</span>
                        <input type="time" value={editOut} onChange={e => setEditOut(e.target.value)} className="ts-time-input" />
                        <button className="ts-save-btn" onClick={() => saveEdit(s)}>✓</button>
                        <button className="ts-cancel-btn" onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    ) : (
                      <>
                        <div className="ts-session-times" onClick={() => startEdit(s)}>
                          <span className="ts-time-in">{fmtTime(s.clockIn)}</span>
                          <span className="ts-session-sep">→</span>
                          <span className="ts-time-out">{s.clockOut ? fmtTime(s.clockOut) : 'Active'}</span>
                        </div>
                        <div className="ts-session-bottom">
                          <span className="ts-session-dur">{fmtMs(s.durationMs)}</span>
                          <button className="ts-del-btn" onClick={() => deleteSession(s.id)}>✕</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {isAdding ? (
                  <div className="ts-add-form">
                    <input type="time" value={newIn} onChange={e => setNewIn(e.target.value)} className="ts-time-input" />
                    <span className="ts-session-sep">→</span>
                    <input type="time" value={newOut} onChange={e => setNewOut(e.target.value)} className="ts-time-input" />
                    <button className="ts-save-btn" onClick={() => addSession(day)}>✓</button>
                    <button className="ts-cancel-btn" onClick={() => setAddingDay(null)}>✕</button>
                  </div>
                ) : (
                  <button className="ts-add-btn" onClick={() => setAddingDay(key)}>+ Add</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
