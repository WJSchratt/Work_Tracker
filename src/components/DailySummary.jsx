import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc, collection, getDocs, orderBy, query } from 'firebase/firestore'
import { format, isToday, isWithinInterval, startOfWeek, endOfWeek, parseISO, subDays } from 'date-fns'

function fmtMs(ms) {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

function fmtTime(iso) {
  try { return format(parseISO(iso), 'h:mm a') } catch { return '' }
}

export default function DailySummary({ tasks, sessions, todayMs }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [note, setNote] = useState('')
  const [todayNotes, setTodayNotes] = useState([])
  const [history, setHistory] = useState([]) // [{date, notes:[]}]
  const [collapsedDays, setCollapsedDays] = useState({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Load today's notes + recent history
  useEffect(() => {
    // Load today
    getDoc(doc(db, 'dailySummaries', today)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        if (Array.isArray(data.notes)) {
          setTodayNotes(data.notes)
        } else if (data.note) {
          // Migrate old single-note format
          setTodayNotes([{ text: data.note, savedAt: data.savedAt || today }])
        }
      }
    }).catch(err => setError('Failed to load notes: ' + err.message))

    // Load last 14 days of history
    const past = []
    const fetches = []
    for (let i = 1; i <= 14; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
      fetches.push(
        getDoc(doc(db, 'dailySummaries', d)).then(snap => {
          if (snap.exists()) {
            const data = snap.data()
            const notes = Array.isArray(data.notes)
              ? data.notes
              : data.note ? [{ text: data.note, savedAt: data.savedAt || d }] : []
            if (notes.length > 0) past.push({ date: d, notes })
          }
        })
      )
    }
    Promise.all(fetches).then(() => {
      past.sort((a, b) => b.date.localeCompare(a.date))
      setHistory(past)
    })
  }, [today])

  const doneTodayTasks = tasks.filter(t => {
    if (t.status !== 'done' && !t.archived) return false
    try { return isToday(t.updatedAt?.toDate()) } catch { return false }
  })

  const archivedTodayTasks = tasks.filter(t => {
    if (!t.archived) return false
    try { return isToday(t.updatedAt?.toDate()) } catch { return false }
  })

  const completedToday = [...doneTodayTasks, ...archivedTodayTasks]

  const weekMs = sessions.filter(s => {
    try {
      return isWithinInterval(new Date(s.clockIn), {
        start: startOfWeek(new Date(), { weekStartsOn: 1 }),
        end: endOfWeek(new Date(), { weekStartsOn: 1 })
      })
    } catch { return false }
  }).reduce((a, s) => a + (s.durationMs || 0), 0)

  const todaySessions = sessions.filter(s => {
    try { return isToday(new Date(s.clockIn)) } catch { return false }
  })

  const handleSave = async () => {
    if (!note.trim()) return
    setSaving(true)
    setError(null)
    try {
      const newEntry = { text: note.trim(), savedAt: new Date().toISOString() }
      const updated = [...todayNotes, newEntry]
      await setDoc(doc(db, 'dailySummaries', today), {
        notes: updated,
        date: today,
        updatedAt: new Date().toISOString()
      })
      setTodayNotes(updated)
      setNote('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (date) => {
    setCollapsedDays(prev => ({ ...prev, [date]: !prev[date] }))
  }

  return (
    <div className="daily-summary-view">
      <div className="ds-header">
        <h2 className="ds-title">Daily Summary</h2>
        <span className="ds-date">{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
      </div>

      <div className="ds-grid">
        {/* Stats */}
        <div className="ds-card ds-stats">
          <div className="ds-card-title">Today at a Glance</div>
          <div className="ds-stat-row">
            <span className="ds-stat-label">Time Worked</span>
            <span className="ds-stat-val ds-accent">{fmtMs(todayMs)}</span>
          </div>
          <div className="ds-stat-row">
            <span className="ds-stat-label">Tasks Completed</span>
            <span className="ds-stat-val ds-green">{completedToday.length}</span>
          </div>
          <div className="ds-stat-row">
            <span className="ds-stat-label">Sessions</span>
            <span className="ds-stat-val">{todaySessions.length}</span>
          </div>
          <div className="ds-stat-row">
            <span className="ds-stat-label">This Week</span>
            <span className="ds-stat-val">{fmtMs(weekMs)}</span>
          </div>
        </div>

        {/* Completed tasks */}
        <div className="ds-card ds-completed">
          <div className="ds-card-title">Completed Today</div>
          {completedToday.length === 0 ? (
            <div className="ds-empty">No tasks completed yet today</div>
          ) : (
            <ul className="ds-task-list">
              {completedToday.map(t => (
                <li key={t.id} className="ds-task-item">
                  <span className="ds-task-dot" data-priority={t.priority} />
                  <span className="ds-task-title">{t.title}</span>
                  {t.priority && <span className="ds-task-priority" data-priority={t.priority}>{t.priority}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sessions breakdown */}
        {todaySessions.length > 0 && (
          <div className="ds-card ds-sessions">
            <div className="ds-card-title">Work Sessions</div>
            <ul className="ds-session-list">
              {todaySessions.map(s => {
                const inn = new Date(s.clockIn)
                const out = s.clockOut ? new Date(s.clockOut) : null
                return (
                  <li key={s.id} className="ds-session-item">
                    <span className="ds-session-time">
                      {format(inn, 'h:mm a')} {out ? `– ${format(out, 'h:mm a')}` : '– ongoing'}
                    </span>
                    <span className="ds-session-dur">{fmtMs(s.durationMs || 0)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Notes for today */}
        <div className="ds-card ds-note-card">
          <div className="ds-card-title">End of Day Notes</div>

          {/* Today's saved notes */}
          {todayNotes.length > 0 && (
            <div className="ds-notes-list">
              {todayNotes.map((n, i) => (
                <div key={i} className="ds-note-entry">
                  <span className="ds-note-time">{fmtTime(n.savedAt)}</span>
                  <span className="ds-note-text">{n.text}</span>
                </div>
              ))}
            </div>
          )}

          <textarea
            className="ds-textarea"
            placeholder="Add a note for today — what did you accomplish, any blockers, wins, or things to carry over..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={4}
          />
          {error && <div className="ds-error">{error}</div>}
          <div className="ds-note-footer">
            <button className="ds-save-btn" onClick={handleSave} disabled={saving || !note.trim()}>
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Add Note'}
            </button>
          </div>
        </div>
      </div>

      {/* Previous days history */}
      {history.length > 0 && (
        <div className="ds-history">
          <button className="ds-history-toggle" onClick={() => setHistoryOpen(o => !o)}>
            {historyOpen ? '▼' : '▶'} Previous Notes ({history.length} days)
          </button>

          {historyOpen && (
            <div className="ds-history-list">
              {history.map(({ date, notes }) => {
                const collapsed = collapsedDays[date] !== false // default collapsed
                const label = format(parseISO(date), 'EEEE, MMMM d')
                return (
                  <div key={date} className="ds-history-day">
                    <button className="ds-day-toggle" onClick={() => toggleDay(date)}>
                      <span className="ds-day-arrow">{collapsed ? '▶' : '▼'}</span>
                      <span className="ds-day-label">{label}</span>
                      <span className="ds-day-count">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                    </button>
                    {!collapsed && (
                      <div className="ds-day-notes">
                        {notes.map((n, i) => (
                          <div key={i} className="ds-note-entry">
                            <span className="ds-note-time">{fmtTime(n.savedAt)}</span>
                            <span className="ds-note-text">{n.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
