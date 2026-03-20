import { useState } from 'react'
import { db } from '../firebase'
import { deleteDoc, doc } from 'firebase/firestore'
import { format } from 'date-fns'
import './TranscriptArchive.css'

const TYPE_LABELS = { transcript: 'Transcript', voice: 'Voice Note', note: 'Note' }
const TYPE_COLORS = { transcript: '#6c63ff', voice: '#22c55e', note: '#f59e0b' }

export default function TranscriptArchive({ transcripts }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [filterType, setFilterType] = useState('all')

  const filtered = transcripts.filter(t => {
    const matchSearch = !search || t.text?.toLowerCase().includes(search.toLowerCase()) || t.summary?.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || t.type === filterType
    return matchSearch && matchType
  })

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return
    await deleteDoc(doc(db, 'transcripts', id))
  }

  return (
    <div className="ta-view">
      <div className="ta-header">
        <h2 className="ta-title">Transcript & Voice Archive <span className="ta-count">{transcripts.length}</span></h2>
        <div className="ta-controls">
          <input
            className="ta-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transcripts, notes..."
          />
          <select className="ta-filter" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All types</option>
            <option value="transcript">Transcripts</option>
            <option value="voice">Voice Notes</option>
            <option value="note">Notes</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="ta-empty">
          {search ? 'No results found.' : 'No entries yet — add a transcript or voice note from the board.'}
        </div>
      )}

      <div className="ta-list">
        {filtered.map(t => (
          <div key={t.id} className="ta-item">
            <div className="ta-item-header" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
              <div className="ta-item-left">
                <span className="ta-type-badge" style={{ background: TYPE_COLORS[t.type] + '22', color: TYPE_COLORS[t.type] }}>
                  {TYPE_LABELS[t.type] || 'Entry'}
                </span>
                <div className="ta-item-meta">
                  <span className="ta-item-date">{t.createdAt ? format(t.createdAt.toDate(), 'MMM d, yyyy h:mm a') : '—'}</span>
                  <span className="ta-item-by">{t.addedBy}</span>
                </div>
                {t.summary && <p className="ta-item-summary">{t.summary}</p>}
              </div>
              <div className="ta-item-right">
                {t.tasks?.length > 0 && <span className="ta-tasks-badge">{t.tasks.length} tasks</span>}
                <button className="ta-delete" onClick={e => { e.stopPropagation(); handleDelete(t.id) }}>✕</button>
                <span className="ta-expand">{expanded === t.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expanded === t.id && (
              <div className="ta-item-body">
                {t.text && (
                  <div className="ta-section">
                    <div className="ta-section-label">Full Text</div>
                    <div className="ta-section-text">{t.text}</div>
                  </div>
                )}
                {t.tasks?.length > 0 && (
                  <div className="ta-section">
                    <div className="ta-section-label">Extracted Tasks</div>
                    {t.tasks.map((task, i) => (
                      <div key={i} className="ta-task-row">
                        <span className="ta-task-priority" data-priority={task.priority}>{task.priority}</span>
                        <span className="ta-task-title">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
