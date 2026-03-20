import { useState, useEffect, useRef } from 'react'
import { db, auth } from '../firebase'
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { format } from 'date-fns'
import './DailyBriefing.css'

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY

async function callClaude(prompt, systemPrompt) {
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
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.[0]?.text || ''
}

export default function DailyBriefing({ tasks, onAddTasks }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('transcript')
  const [transcript, setTranscript] = useState('')
  const [loading, setLoading] = useState(false)
  const [briefings, setBriefings] = useState([])
  const [error, setError] = useState('')
  const [popup, setPopup] = useState(null)
  const [selected, setSelected] = useState({})
  const [transcribing, setTranscribing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [dailySummary, setDailySummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const fileRef = useRef(null)
  const finalRef = useRef('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'briefings'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setBriefings(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  // Auto-generate summary on mount if tasks exist
  useEffect(() => {
    if (tasks.length > 0 && !dailySummary) generateSummary()
  }, [])

  const generateSummary = async () => {
    setSummaryLoading(true)
    try {
      const active = tasks.filter(t => !t.archived)
      const inProgress = active.filter(t => t.status === 'inprogress').map(t => t.title)
      const todo = active.filter(t => t.status === 'todo').sort((a,b) => ({critical:0,high:1,medium:2,low:3}[a.priority]??3) - ({critical:0,high:1,medium:2,low:3}[b.priority]??3)).slice(0,5).map(t => `[${t.priority}] ${t.title}`)
      const list = [...inProgress.map(t => `[IN PROGRESS] ${t}`), ...todo].join('\n') || 'No tasks'
      const result = await callClaude(
        `Tasks:\n${list}\n\nWrite a 2-sentence daily focus summary. What's the priority today? Be direct.`,
        'You are a productivity assistant. Be extremely concise — max 2 sentences.'
      )
      setDailySummary(result)
    } catch(e) {}
    setSummaryLoading(false)
  }

  const processText = async (text) => {
    if (!text.trim()) return
    setLoading(true); setError('')
    try {
      const result = await callClaude(
        `Transcript:\n\n"${text}"\n\nReturn ONLY valid JSON no markdown:\n{"summary":"2 sentence summary","tasks":[{"title":"...","priority":"critical|high|medium|low","description":"..."}]}`,
        'Extract tasks from transcript. Return only valid JSON.'
      )
      const parsed = JSON.parse(result.replace(/```json|```/g, '').trim())
      // init all selected
      const sel = {}
      parsed.tasks.forEach((_, i) => sel[i] = true)
      setSelected(sel)
      setPopup(parsed)
      await addDoc(collection(db, 'briefings'), {
        transcript: text.trim(), summary: parsed.summary, tasks: parsed.tasks,
        createdAt: serverTimestamp(), addedBy: auth.currentUser?.email || 'Walt'
      })
    } catch(e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setTranscribing(true); setError('')
    try {
      // Use Web Speech on the file if audio/video — fallback: tell user to paste transcript
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) { setError('Auto-transcription requires Chrome. Please paste the transcript manually.'); setTranscribing(false); return }
      // Create audio element and play through recognition
      const url = URL.createObjectURL(file)
      setError('File uploaded. Web Speech API cannot transcribe files directly — please paste the transcript text instead, or record live using the Voice tab.')
    } catch(e) { setError('Upload error: ' + e.message) }
    setTranscribing(false)
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
    r.onend = () => { setTranscript(finalRef.current.trim()); setRecording(false); setLiveText('') }
    recognitionRef.current = r; r.start(); setRecording(true)
  }

  const stopVoice = () => { recognitionRef.current?.stop() }

  const confirmTasks = () => {
    const toAdd = popup.tasks.filter((_, i) => selected[i])
    onAddTasks(toAdd)
    generateSummary()
    setPopup(null); setTranscript(''); setOpen(false)
  }

  return (
    <>
      {/* Compact always-visible bar */}
      <div className="briefing-bar">
        <div className="briefing-bar-left">
          <span className="briefing-bar-icon">⚡</span>
          <div className="briefing-bar-text">
            {summaryLoading ? <span className="briefing-loading">Generating today's focus...</span>
              : dailySummary ? <span className="briefing-summary-text">{dailySummary}</span>
              : <span className="briefing-summary-text briefing-dim">Click ⚡ to generate today's focus</span>}
          </div>
        </div>
        <div className="briefing-bar-right">
          <button className="briefing-refresh" onClick={generateSummary} title="Refresh summary">↻</button>
          <button className="briefing-open-btn" onClick={() => setOpen(o => !o)}>
            {open ? '▲ Close' : '+ Add from Transcript'}
          </button>
        </div>
      </div>

      {/* Expandable panel */}
      {open && (
        <div className="briefing-panel">
          <div className="briefing-tabs">
            <button className={`btab ${tab === 'transcript' ? 'active' : ''}`} onClick={() => setTab('transcript')}>Transcript / Text</button>
            <button className={`btab ${tab === 'voice' ? 'active' : ''}`} onClick={() => setTab('voice')}>Voice</button>
            <button className={`btab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
          </div>

          {tab === 'transcript' && (
            <div className="briefing-tab-body">
              <div className="briefing-upload-row">
                <button className="btn-upload" onClick={() => fileRef.current?.click()} disabled={transcribing}>
                  📎 Upload MP4 / Audio
                </button>
                <input ref={fileRef} type="file" accept="audio/*,video/*" style={{display:'none'}} onChange={handleFileUpload} />
                <span className="upload-hint">or paste transcript below</span>
              </div>
              <textarea className="transcript-input" value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste Loom transcript, meeting notes, or any text from Jeremiah..." rows={5} />
              {error && <div className="briefing-error">{error}</div>}
              <button className="btn-extract" onClick={() => processText(transcript)} disabled={loading || !transcript.trim()}>
                {loading ? 'Processing...' : '✦ Extract Tasks'}
              </button>
            </div>
          )}

          {tab === 'voice' && (
            <div className="briefing-tab-body">
              <p className="briefing-hint">Speak your notes — Claude will extract tasks from what you say.</p>
              {recording && <div className="live-preview">{liveText || 'Listening...'}</div>}
              <div className="voice-row">
                {!recording
                  ? <button className="btn-record-b" onClick={startVoice}>🎙 Start Recording</button>
                  : <button className="btn-stop-b" onClick={stopVoice}>⏹ Stop & Process</button>}
                {recording && <span className="rec-dot">● Recording</span>}
              </div>
              {transcript && !recording && (
                <>
                  <textarea className="transcript-input" value={transcript} onChange={e => setTranscript(e.target.value)} rows={4} />
                  <button className="btn-extract" onClick={() => processText(transcript)} disabled={loading}>
                    {loading ? 'Processing...' : '✦ Extract Tasks'}
                  </button>
                </>
              )}
              {error && <div className="briefing-error">{error}</div>}
            </div>
          )}

          {tab === 'history' && (
            <div className="briefing-tab-body">
              {briefings.length === 0 && <div className="briefing-hint">No history yet.</div>}
              {briefings.map(b => (
                <div key={b.id} className="history-row">
                  <div className="history-row-header">
                    <span className="history-date">{b.createdAt ? format(b.createdAt.toDate(), 'MMM d, h:mm a') : '—'}</span>
                    <span className="history-count">{b.tasks?.length || 0} tasks extracted</span>
                  </div>
                  <div className="history-summary">{b.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task selection popup */}
      {popup && (
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
                  <input type="checkbox" checked={!!selected[i]} onChange={e => setSelected(s => ({...s, [i]: e.target.checked}))} />
                  <div className="popup-task-info">
                    <span className="popup-priority" data-priority={t.priority}>{t.priority}</span>
                    <span className="popup-task-title">{t.title}</span>
                    {t.description && <span className="popup-task-desc">{t.description}</span>}
                  </div>
                </label>
              ))}
            </div>
            <div className="popup-footer">
              <button className="btn-add-selected" onClick={confirmTasks}>
                + Add {Object.values(selected).filter(Boolean).length} Selected Tasks
              </button>
              <button className="btn-add-all-p" onClick={() => { popup.tasks.forEach((_,i) => selected[i] = true); confirmTasks() }}>
                Add All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
