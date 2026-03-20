import { useState } from 'react'
import { db } from '../firebase'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns'
import './TranscriptArchive.css'

const CATEGORIES = ['Meeting Notes', 'Voice Note', 'Loom Transcript', 'Signal', 'General']

const CAT_COLORS = {
  'Meeting Notes': '#6c63ff',
  'Voice Note': '#22c55e',
  'Loom Transcript': '#f59e0b',
  'Signal': '#3b82f6',
  'General': '#8080a0'
}

export default function TranscriptArchive({ transcripts }) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [editingCat, setEditingCat] = useState(null)

  const filtered = transcripts.filter(t => {
    const matchSearch = !search ||
      t.text?.toLowerCase().includes(search.toLowerCase()) ||
      t.summary?.toLowerCase().includes(search.toLowerCase()) ||
      t.category?.toLowerCase().includes(search.toLowerCase())

    const matchCat = filterCat === 'all' || t.category === filterCat

    let matchDate = true
    if (dateFrom || dateTo) {
      try {
        const date = t.createdAt?.toDate()
        if (date) {
          const from = dateFrom ? startOfDay(new Date(dateFrom)) : new Date(0)
          const to = dateTo ? endOfDay(new Date(dateTo)) : new Date()
          matchDate = isWithinInterval(date, { start: from, end: to })
        }
      } catch { matchDate = true }
    }

    return matchSearch && matchCat && matchDate
  })

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return
    await deleteDoc(doc(db, 'transcripts', id))
  }

  const setCategory = async (id, category) => {
    await updateDoc(doc(db, 'transcripts', id), { category })
    setEditingCat(null)
  }

  const clearFilters = () => {
    setSearch(''); setFilterCat('all'); setDateFrom(''); setDateTo('')
  }

  const hasFilters = search || filterCat !== 'all' || dateFrom || dateTo

  return (
    <div className="ta-view">
      <div className="ta-header">
        <div className="ta-title-row">
          <h2 className="ta-title">Transcripts & Notes <span className="ta-count">{transcripts.length}</span></h2>
          {hasFilters && <button className="ta-clear" onClick={clearFilters}>Clear filters</button>}
        </div>

        <div className="ta-filters">
          <input className="ta-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search content, summaries..." />
          <select className="ta-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="ta-date-range">
            <input type="date" className="ta-select" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
            <span className="ta-date-sep">→</span>
            <input type="date" className="ta-select" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
          </div>
        </div>

        <div className="ta-cat-pills">
          <button className={`ta-cat-pill ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>All</button>
          {CATEGORIES.map(c => (
            <button key={c} className={`ta-cat-pill ${filterCat === c ? 'active' : ''}`}
              style={filterCat === c ? { background: CAT_COLORS[c] + '22', color: CAT_COLORS[c], borderColor: CAT_COLORS[c] } : {}}
              onClick={() => setFilterCat(c)}>{c}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="ta-empty">
          {hasFilters ? 'No results matching your filters.' : 'No entries yet — add a transcript or voice note from the board.'}
        </div>
      )}

      <div className="ta-list">
        {filtered.map(t => {
          const cat = t.category || 'General'
          const color = CAT_COLORS[cat] || CAT_COLORS.General
          return (
            <div key={t.id} className="ta-item">
              <div className="ta-item-header" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                <div className="ta-item-left">
                  <div className="ta-item-top">
                    {editingCat === t.id ? (
                      <select className="ta-cat-select" autoFocus
                        defaultValue={cat}
                        onChange={e => setCategory(t.id, e.target.value)}
                        onBlur={() => setEditingCat(null)}
                        onClick={e => e.stopPropagation()}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span className="ta-cat-badge"
                        style={{ background: color + '22', color, borderColor: color + '44' }}
                        onClick={e => { e.stopPropagation(); setEditingCat(t.id) }}
                        title="Click to change category"
                      >{cat}</span>
                    )}
                    <span className="ta-item-date">
                      {t.createdAt ? format(t.createdAt.toDate(), 'MMM d, yyyy · h:mm a') : '—'}
                    </span>
                    <span className="ta-item-by">{t.addedBy}</span>
                  </div>
                  {t.summary && <p className="ta-item-summary">{t.summary}</p>}
                  {!t.summary && t.text && <p className="ta-item-preview">{t.text.slice(0, 120)}{t.text.length > 120 ? '…' : ''}</p>}
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
          )
        })}
      </div>
    </div>
  )
}
