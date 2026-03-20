import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { format, isToday, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns'

function fmtMs(ms) {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

export default function DailySummary({ tasks, sessions, todayMs }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDoc(doc(db, 'dailySummaries', today)).then(snap => {
      if (snap.exists()) setNote(snap.data().note || '')
    }).catch(err => setError('Failed to load notes: ' + err.message))
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
    setSaving(true)
    setError(null)
    try {
      await setDoc(doc(db, 'dailySummaries', today), {
        note,
        date: today,
        savedAt: new Date().toISOString()
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
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

        {/* Summary note */}
        <div className="ds-card ds-note-card">
          <div className="ds-card-title">End of Day Notes</div>
          <textarea
            className="ds-textarea"
            placeholder="What did you accomplish today? Any blockers, wins, or things to carry over tomorrow..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={6}
          />
          {error && <div className="ds-error">{error}</div>}
          <div className="ds-note-footer">
            <button className="ds-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Notes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
