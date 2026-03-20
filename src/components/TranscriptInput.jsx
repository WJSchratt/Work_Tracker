import { useState, useRef } from 'react'
import { db, auth } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import './TranscriptInput.css'

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.[0]?.text || ''
}

async function transcribeWithAssemblyAI(file) {
  // Step 1: Upload via our serverless proxy
  const uploadRes = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'x-action': 'upload', 'content-type': file.type || 'application/octet-stream' },
    body: file
  })
  const { upload_url } = await uploadRes.json()
  if (!upload_url) throw new Error('Upload failed')

  // Step 2: Request transcription
  const transcriptRes = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'x-action': 'transcribe', 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url })
  })
  const { id } = await transcriptRes.json()
  if (!id) throw new Error('Transcription request failed')

  // Step 3: Poll until done
  let attempts = 0
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 3000))
    const pollRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'x-action': 'poll', 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    })
    const result = await pollRes.json()
    if (result.status === 'completed') return result.text
    if (result.status === 'error') throw new Error(result.error)
    attempts++
  }
  throw new Error('Transcription timed out')
}

export default function TranscriptInput({ onAddTasks, onClose, asModal }) {
  const [mode, setMode] = useState('text')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [recording, setRecording] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [error, setError] = useState('')
  const [popup, setPopup] = useState(null)
  const [selected, setSelected] = useState({})
  const recognitionRef = useRef(null)
  const finalRef = useRef('')
  const fileRef = useRef(null)

  const process = async (input) => {
    if (!input.trim()) return
    setLoading(true); setError('')
    try {
      const result = await callClaude(
        `Transcript/notes:\n\n"${input}"\n\nReturn ONLY valid JSON no markdown:\n{"summary":"2 sentence summary","tasks":[{"title":"...","priority":"critical|high|medium|low","description":"..."}]}`
      )
      const parsed = JSON.parse(result.replace(/```json|```/g, '').trim())
      const sel = {}
      parsed.tasks.forEach((_, i) => sel[i] = true)
      setSelected(sel)
      setPopup({ ...parsed, rawText: input })
      await addDoc(collection(db, 'transcripts'), {
        text: input.trim(), summary: parsed.summary, tasks: parsed.tasks,
        type: 'transcript', createdAt: serverTimestamp(), addedBy: auth.currentUser?.email || 'Walt'
      })
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true); setError(''); setUploadStatus('Uploading file...')
    try {
      setUploadStatus('Transcribing... this may take 1-2 minutes')
      const transcript = await transcribeWithAssemblyAI(file)
      setUploadStatus('Transcription complete!')
      setText(transcript)
      setMode('text')
      await process(transcript)
    } catch (e) { setError('Transcription error: ' + e.message) }
    setUploading(false); setUploadStatus('')
    e.target.value = ''
  }

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Voice requires Chrome'); return }
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'en-US'
    finalRef.current = ''
    r.onresult = e => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      setLiveText(finalRef.current + interim)
    }
    r.onend = () => {
      const t = finalRef.current.trim()
      if (t) { setText(t); process(t) }
      setRecording(false); setLiveText('')
    }
    recognitionRef.current = r; r.start(); setRecording(true)
  }

  const stopVoice = () => { recognitionRef.current?.stop() }

  const confirmTasks = (addAll = false) => {
    const toAdd = popup.tasks.filter((_, i) => addAll || selected[i])
    onAddTasks(toAdd)
    setPopup(null); setText('')
    if (onClose) onClose()
  }

  const saveAsNote = async () => {
    if (!text.trim()) return
    await addDoc(collection(db, 'transcripts'), {
      text: text.trim(), type: 'note', summary: '',
      createdAt: serverTimestamp(), addedBy: auth.currentUser?.email || 'Walt'
    })
    setText(''); if (onClose) onClose()
  }

  const content = (
    <div className="ti-modal-inner">
      <div className="ti-modal-header">
        <h2>Add Transcript / Voice Note</h2>
        {onClose && <button className="ti-close" onClick={onClose}>✕</button>}
      </div>

      <div className="ti-mode-tabs">
        <button className={`ti-tab ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>📄 Paste Text</button>
        <button className={`ti-tab ${mode === 'voice' ? 'active' : ''}`} onClick={() => setMode('voice')}>🎙 Voice</button>
        <button className={`ti-tab ${mode === 'file' ? 'active' : ''}`} onClick={() => setMode('file')}>📎 Upload File</button>
      </div>

      {mode === 'text' && (
        <div className="ti-body">
          <textarea className="ti-textarea" value={text} onChange={e => setText(e.target.value)}
            placeholder="Paste Loom transcript, meeting notes, Jeremiah's instructions..." rows={7} autoFocus />
          {error && <div className="ti-error">{error}</div>}
          <div className="ti-actions">
            <button className="ti-btn-extract" onClick={() => process(text)} disabled={loading || !text.trim()}>
              {loading ? 'Processing...' : '✦ Extract Tasks'}
            </button>
            <button className="ti-btn-save" onClick={saveAsNote} disabled={!text.trim()}>Save as Note Only</button>
          </div>
        </div>
      )}

      {mode === 'voice' && (
        <div className="ti-body">
          <p className="ti-hint">Speak your notes — Claude will extract tasks. Chrome only.</p>
          {recording && <div className="ti-live">{liveText || 'Listening...'}</div>}
          <div className="ti-voice-row">
            {!recording
              ? <button className="ti-btn-rec" onClick={startVoice}>🎙 Start Recording</button>
              : <button className="ti-btn-stop" onClick={stopVoice}>⏹ Stop & Process</button>}
            {recording && <span className="ti-rec-dot">● Recording</span>}
          </div>
          {error && <div className="ti-error">{error}</div>}
        </div>
      )}

      {mode === 'file' && (
        <div className="ti-body">
          <p className="ti-hint">Upload an MP4, MP3, WAV, or any audio/video file. AssemblyAI will transcribe it automatically — usually takes 1-2 minutes.</p>
          {uploading ? (
            <div className="ti-uploading">
              <div className="ti-spinner" />
              <span>{uploadStatus}</span>
            </div>
          ) : (
            <button className="ti-btn-upload" onClick={() => fileRef.current?.click()}>
              📎 Choose File (MP4, MP3, WAV, M4A...)
            </button>
          )}
          <input ref={fileRef} type="file" accept="audio/*,video/*,.mp4,.mp3,.wav,.m4a,.webm" style={{ display: 'none' }} onChange={handleFileUpload} />
          {error && <div className="ti-error">{error}</div>}
        </div>
      )}
    </div>
  )

  if (popup) {
    return (
      <div className="popup-overlay" onClick={e => e.target === e.currentTarget && setPopup(null)}>
        <div className="popup">
          <div className="popup-header">
            <h3>Extracted Tasks</h3>
            <button className="popup-close" onClick={() => setPopup(null)}>✕</button>
          </div>
          <div className="popup-summary">{popup.summary}</div>
          <div className="popup-tasks">
            {popup.tasks.map((t, i) => (
              <label key={i} className={`popup-task ${selected[i] ? 'selected' : ''}`}>
                <input type="checkbox" checked={!!selected[i]} onChange={e => setSelected(s => ({ ...s, [i]: e.target.checked }))} />
                <div className="popup-task-info">
                  <span className="popup-priority" data-priority={t.priority}>{t.priority}</span>
                  <span className="popup-task-title">{t.title}</span>
                  {t.description && <span className="popup-task-desc">{t.description}</span>}
                </div>
              </label>
            ))}
          </div>
          <div className="popup-footer">
            <button className="btn-add-selected" onClick={() => confirmTasks(false)}>
              + Add {Object.values(selected).filter(Boolean).length} Selected
            </button>
            <button className="btn-add-all-p" onClick={() => confirmTasks(true)}>Add All</button>
          </div>
        </div>
      </div>
    )
  }

  if (asModal) {
    return (
      <div className="popup-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
        <div className="ti-modal">{content}</div>
      </div>
    )
  }

  return content
}
