import { useState } from 'react'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { format } from 'date-fns'
import './IssuesBoard.css'

const STATUSES = [
  { key: 'open', label: 'Open', color: '#ef4444' },
  { key: 'waiting', label: 'Waiting on Jeremiah', color: '#f59e0b' },
  { key: 'resolved', label: 'Resolved', color: '#22c55e' }
]

export default function IssuesBoard({ issues, currentUser }) {
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [newNote, setNewNote] = useState('')

  const addIssue = async () => {
    if (!title.trim()) return
    setSaving(true)
    await addDoc(collection(db, 'issues'), {
      title: title.trim(),
      description: description.trim(),
      status: 'open',
      createdBy: currentUser?.email || 'Walt',
      createdAt: serverTimestamp(),
      notes: []
    })
    setTitle(''); setDescription(''); setShowNew(false); setSaving(false)
  }

  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, 'issues', id), { status })
  }

  const deleteIssue = async (id) => {
    if (!window.confirm('Delete this issue?')) return
    await deleteDoc(doc(db, 'issues', id))
  }

  const addNote = async (issue) => {
    if (!newNote.trim()) return
    const note = { text: newNote.trim(), ts: new Date().toISOString(), by: currentUser?.email || 'Walt' }
    await updateDoc(doc(db, 'issues', issue.id), { notes: [...(issue.notes || []), note] })
    setNewNote('')
  }

  const openIssues = issues.filter(i => i.status !== 'resolved')
  const resolvedIssues = issues.filter(i => i.status === 'resolved')

  return (
    <div className="issues-board">
      <div className="issues-header">
        <div className="issues-title">
          <span className="issues-icon">⚠</span>
          Issues & Blockers
          {openIssues.length > 0 && <span className="issues-badge">{openIssues.length}</span>}
        </div>
        <button className="btn-new-issue" onClick={() => setShowNew(!showNew)}>+ Log Issue</button>
      </div>

      {showNew && (
        <div className="new-issue-form">
          <input
            className="issue-input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Issue title..." autoFocus
          />
          <textarea
            className="issue-input" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Describe the issue, what's blocking you, what you need from Jeremiah..." rows={3}
          />
          <div className="new-issue-actions">
            <button className="btn-cancel-issue" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn-save-issue" onClick={addIssue} disabled={saving || !title.trim()}>
              {saving ? 'Saving...' : 'Log Issue'}
            </button>
          </div>
        </div>
      )}

      <div className="issues-list">
        {issues.length === 0 && !showNew && (
          <div className="issues-empty">No open issues — you're unblocked 🟢</div>
        )}
        {openIssues.map(issue => (
          <div key={issue.id} className={`issue-item status-${issue.status}`}>
            <div className="issue-row" onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}>
              <div className="issue-left">
                <span className={`status-pill status-${issue.status}`}>
                  {STATUSES.find(s => s.key === issue.status)?.label}
                </span>
                <span className="issue-title">{issue.title}</span>
              </div>
              <div className="issue-right">
                <span className="issue-meta">{issue.createdBy} · {issue.createdAt ? format(issue.createdAt.toDate(), 'MMM d') : '—'}</span>
                <select
                  className="status-select-inline"
                  value={issue.status}
                  onChange={e => { e.stopPropagation(); updateStatus(issue.id, e.target.value) }}
                  onClick={e => e.stopPropagation()}
                >
                  {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <button className="issue-del" onClick={e => { e.stopPropagation(); deleteIssue(issue.id) }}>✕</button>
              </div>
            </div>

            {expandedId === issue.id && (
              <div className="issue-expanded">
                {issue.description && <div className="issue-desc">{issue.description}</div>}
                <div className="issue-notes">
                  {(issue.notes || []).map((n, i) => (
                    <div key={i} className="issue-note">
                      <div className="issue-note-text">{n.text}</div>
                      <div className="issue-note-meta">{n.by} · {format(new Date(n.ts), 'MMM d, h:mm a')}</div>
                    </div>
                  ))}
                  <div className="issue-note-input">
                    <input
                      className="issue-input" value={newNote} onChange={e => setNewNote(e.target.value)}
                      placeholder="Add a note or update..." onKeyDown={e => e.key === 'Enter' && addNote(issue)}
                    />
                    <button className="btn-save-issue" onClick={() => addNote(issue)}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {resolvedIssues.length > 0 && (
          <details className="resolved-section">
            <summary className="resolved-summary">Resolved ({resolvedIssues.length})</summary>
            {resolvedIssues.map(issue => (
              <div key={issue.id} className="issue-item status-resolved">
                <div className="issue-row">
                  <div className="issue-left">
                    <span className="status-pill status-resolved">Resolved</span>
                    <span className="issue-title resolved-title">{issue.title}</span>
                  </div>
                  <button className="issue-del" onClick={() => deleteIssue(issue.id)}>✕</button>
                </div>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  )
}
