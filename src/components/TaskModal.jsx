import { useState } from 'react'
import { format } from 'date-fns'
import './TaskModal.css'

const STATUSES = [
  { key: 'todo', label: 'To Do' },
  { key: 'inprogress', label: 'In Progress' },
  { key: 'testing', label: 'Testing' },
  { key: 'done', label: 'Done' }
]
const PRIORITIES = ['critical', 'high', 'medium', 'low']

export default function TaskModal({ task, onClose, onSave, onDelete, onArchive, onMove }) {
  const isNew = !task
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [priority, setPriority] = useState(task?.priority || 'medium')
  const [status, setStatus] = useState(task?.status || 'todo')
  const [notes, setNotes] = useState(task?.notes || [])
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ title: title.trim(), description, priority, status, notes })
    setSaving(false)
    onClose()
  }

  const addNote = () => {
    if (!newNote.trim()) return
    const note = { text: newNote.trim(), ts: new Date().toISOString() }
    const updated = [...notes, note]
    setNotes(updated)
    setNewNote('')
    if (!isNew) onSave({ notes: updated })
  }

  const deleteNote = (i) => {
    const updated = notes.filter((_, idx) => idx !== i)
    setNotes(updated)
    if (!isNew) onSave({ notes: updated })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isNew ? 'New Task' : 'Task Detail'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-left">
            <div className="field">
              <label>Title</label>
              <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea className="field-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Add context, links, requirements..." rows={4} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Priority</label>
                <select className="field-input" value={priority} onChange={e => setPriority(e.target.value)}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select className="field-input" value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {!isNew && onMove && (
              <div className="field">
                <label>Quick Move</label>
                <div className="quick-move">
                  {STATUSES.map(s => (
                    <button key={s.key} className={`move-btn ${task.status === s.key ? 'active' : ''}`} onClick={() => onMove(s.key)}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-right">
            <div className="notes-section">
              <div className="notes-header">
                <span>Notes</span>
                <span className="notes-count">{notes.length}</span>
              </div>
              <div className="notes-list">
                {notes.length === 0 && <div className="notes-empty">No notes yet</div>}
                {notes.map((n, i) => (
                  <div key={i} className="note-item">
                    <div className="note-text">{n.text}</div>
                    <div className="note-footer">
                      <span className="note-ts">{format(new Date(n.ts), 'MMM d, h:mm a')}</span>
                      <button className="note-del" onClick={() => deleteNote(i)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="note-input-row">
                <textarea className="field-input note-input" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." rows={2} onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addNote() }} />
                <button className="btn-add-note" onClick={addNote}>Add Note</button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {onDelete && (
            <button className="btn-delete" onClick={() => { if (window.confirm('Delete this task?')) onDelete() }}>Delete</button>
          )}
          {onArchive && (
            <button className="btn-archive" onClick={() => { if (window.confirm('Archive this task?')) onArchive() }}>Archive</button>
          )}
          <div className="footer-right">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? 'Saving...' : isNew ? 'Create Task' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
