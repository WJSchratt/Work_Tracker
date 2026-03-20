import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { auth } from '../firebase'
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
  const [voiceNotes, setVoiceNotes] = useState(task?.voiceNotes || [])
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [activeTab, setActiveTab] = useState('notes')
  const recognitionRef = useRef(null)
  const finalRef = useRef('')

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ title: title.trim(), description, priority, status, notes, voiceNotes })
    setSaving(false)
    onClose()
  }

  const addNote = () => {
    if (!newNote.trim()) return
    const note = { text: newNote.trim(), ts: new Date().toISOString(), by: auth.currentUser?.email || 'Walt' }
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

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice notes require Chrome. Please open this app in Chrome.')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    finalRef.current = ''

    recognition.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      setLiveTranscript(finalRef.current + interim)
    }

    recognition.onend = () => {
      const transcript = finalRef.current.trim()
      if (transcript) {
        const vn = { transcript, ts: new Date().toISOString(), by: auth.currentUser?.email || 'Walt' }
        const updated = [...voiceNotes, vn]
        setVoiceNotes(updated)
        if (!isNew) onSave({ voiceNotes: updated })
      }
      setRecording(false)
      setLiveTranscript('')
      finalRef.current = ''
    }

    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
  }

  const deleteVoiceNote = (i) => {
    const updated = voiceNotes.filter((_, idx) => idx !== i)
    setVoiceNotes(updated)
    if (!isNew) onSave({ voiceNotes: updated })
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
            <div className="modal-tabs">
              <button className={`modal-tab ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>
                Notes {notes.length > 0 && <span className="tab-ct">{notes.length}</span>}
              </button>
              <button className={`modal-tab ${activeTab === 'voice' ? 'active' : ''}`} onClick={() => setActiveTab('voice')}>
                Voice {voiceNotes.length > 0 && <span className="tab-ct">{voiceNotes.length}</span>}
              </button>
            </div>

            {activeTab === 'notes' && (
              <div className="notes-section">
                <div className="notes-list">
                  {notes.length === 0 && <div className="notes-empty">No notes yet</div>}
                  {notes.map((n, i) => (
                    <div key={i} className="note-item">
                      <div className="note-text">{n.text}</div>
                      <div className="note-footer">
                        <span className="note-ts">{n.by} · {format(new Date(n.ts), 'MMM d, h:mm a')}</span>
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
            )}

            {activeTab === 'voice' && (
              <div className="voice-section">
                <div className="voice-list">
                  {voiceNotes.length === 0 && !recording && <div className="notes-empty">No voice notes yet — hit Record and speak</div>}
                  {recording && (
                    <div className="live-transcript">
                      <div className="live-label">🔴 Listening...</div>
                      <div className="live-text">{liveTranscript || 'Start speaking...'}</div>
                    </div>
                  )}
                  {voiceNotes.map((vn, i) => (
                    <div key={i} className="voice-note-item">
                      <div className="voice-transcript">
                        <div className="voice-transcript-label">Voice Note</div>
                        <div className="voice-transcript-text">{vn.transcript}</div>
                      </div>
                      <div className="note-footer">
                        <span className="note-ts">{vn.by} · {format(new Date(vn.ts), 'MMM d, h:mm a')}</span>
                        <button className="note-del" onClick={() => deleteVoiceNote(i)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="voice-controls">
                  {!recording ? (
                    <button className="btn-record" onClick={startRecording}>🎙 Record Voice Note</button>
                  ) : (
                    <button className="btn-stop" onClick={stopRecording}>⏹ Stop & Save</button>
                  )}
                  {recording && <span className="recording-indicator">Recording — speak now</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <div className="footer-left">
            {onDelete && (
              <button className="btn-delete" onClick={() => { if (window.confirm('Delete this task?')) onDelete() }}>Delete</button>
            )}
            {onArchive && (
              <button className="btn-archive" onClick={() => { if (window.confirm('Archive this task?')) onArchive() }}>Archive</button>
            )}
          </div>
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
