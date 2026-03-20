import { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, setDoc } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

export default function DailyBriefing({ tasks, onAddTasks }) {
  const [tab, setTab] = useState('summary')
  const [transcript, setTranscript] = useState('')
  const [transcriptResult, setTranscriptResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [audioFile, setAudioFile] = useState(null)
  const [briefings, setBriefings] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'briefings'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setBriefings(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const generateSummary = async () => {
    setSummaryLoading(true)
    const todoTasks = tasks.filter(t => t.status === 'todo' && !t.archived)
    const inProgress = tasks.filter(t => t.status === 'inprogress' && !t.archived)
    const testing = tasks.filter(t => t.status === 'testing' && !t.archived)

    const taskList = [
      ...inProgress.map(t => `[IN PROGRESS - ${t.priority}] ${t.title}`),
      ...testing.map(t => `[TESTING - ${t.priority}] ${t.title}`),
      ...todoTasks.map(t => `[TODO - ${t.priority}] ${t.title}`)
    ].join('\n')

    const result = await callClaude(
      `Here are my current tasks:\n\n${taskList}\n\nToday is ${format(new Date(), 'EEEE, MMMM d')}. Give me a focused daily briefing: what should I tackle today and in what order? Be concise and practical. Max 150 words.`,
      'You are a productivity assistant for a developer at an AI automation agency. Be direct, practical, and encouraging. No fluff.'
    )
    setSummary(result)
    setSummaryLoading(false)
  }

  const processTranscript = async () => {
    if (!transcript.trim()) return
    setLoading(true)
    setTranscriptResult(null)

    const summaryText = await callClaude(
      `Here is a transcript or voice note from my manager:\n\n"${transcript}"\n\nPlease:\n1. Write a 2-3 sentence summary\n2. Extract a list of action items/tasks with suggested priorities (critical/high/medium/low)\n\nRespond in this exact JSON format:\n{"summary": "...", "tasks": [{"title": "...", "priority": "...", "description": "..."}]}`,
      'You are a productivity assistant. Extract clear actionable tasks from transcripts. Return only valid JSON, no markdown.'
    )

    try {
      const cleaned = summaryText.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setTranscriptResult(parsed)

      await addDoc(collection(db, 'briefings'), {
        transcript: transcript.trim(),
        summary: parsed.summary,
        tasks: parsed.tasks,
        createdAt: serverTimestamp(),
        addedBy: auth.currentUser?.email || 'Walt',
        type: 'transcript'
      })
    } catch (e) {
      setTranscriptResult({ summary: summaryText, tasks: [] })
    }
    setLoading(false)
  }

  const processAudio = async () => {
    if (!audioFile) return
    setLoading(true)

    const storage = getStorage()
    const storageRef = ref(storage, `briefings/${Date.now()}-${audioFile.name}`)
    await uploadBytes(storageRef, audioFile)
    const url = await getDownloadURL(storageRef)

    const result = await callClaude(
      `I have an audio file at this URL: ${url}\n\nSince you cannot directly access audio files, please let me know the audio has been saved and ask me to paste the transcript if I have one, or let me know they can use the transcript tab instead.`,
      'You are a helpful assistant.'
    )

    setTranscriptResult({ summary: 'Audio saved. Please use the Transcript tab to paste the text content for AI processing.', tasks: [], audioUrl: url })
    setLoading(false)
    setAudioFile(null)
  }

  const addSuggestedTasks = (tasksToAdd) => {
    onAddTasks(tasksToAdd)
    setTranscriptResult(prev => prev ? { ...prev, added: true } : prev)
  }

  return (
    <div className="briefing">
      <div className="briefing-header">
        <div className="briefing-title">
          <span className="briefing-icon">⚡</span>
          Daily Briefing & AI Assistant
        </div>
        <div className="briefing-tabs">
          <button className={`btab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>Today's Plan</button>
          <button className={`btab ${tab === 'transcript' ? 'active' : ''}`} onClick={() => setTab('transcript')}>Transcripts</button>
          <button className={`btab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
        </div>
      </div>

      {tab === 'summary' && (
        <div className="briefing-body">
          <p className="briefing-hint">Claude will analyze your current tasks and tell you what to focus on today.</p>
          <button className="btn-generate" onClick={generateSummary} disabled={summaryLoading}>
            {summaryLoading ? 'Generating...' : '✦ Generate Today\'s Plan'}
          </button>
          {summary && (
            <div className="briefing-result">
              <div className="briefing-result-label">Today's Plan</div>
              <div className="briefing-result-text">{summary}</div>
            </div>
          )}
        </div>
      )}

      {tab === 'transcript' && (
        <div className="briefing-body">
          <p className="briefing-hint">Paste a Loom transcript, voice note text, or any notes from Jeremiah. Claude will summarize and extract tasks.</p>
          <textarea
            className="transcript-input"
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste transcript or notes here..."
            rows={6}
          />
          <div className="briefing-actions">
            <button className="btn-generate" onClick={processTranscript} disabled={loading || !transcript.trim()}>
              {loading ? 'Processing...' : '✦ Extract Tasks from Transcript'}
            </button>
          </div>

          {transcriptResult && (
            <div className="transcript-result">
              <div className="briefing-result">
                <div className="briefing-result-label">Summary</div>
                <div className="briefing-result-text">{transcriptResult.summary}</div>
              </div>

              {transcriptResult.tasks?.length > 0 && (
                <div className="suggested-tasks">
                  <div className="suggested-label">Suggested Tasks ({transcriptResult.tasks.length})</div>
                  {transcriptResult.tasks.map((t, i) => (
                    <div key={i} className="suggested-task">
                      <div className="suggested-task-left">
                        <span className="suggested-priority" data-priority={t.priority}>{t.priority}</span>
                        <div>
                          <div className="suggested-task-title">{t.title}</div>
                          {t.description && <div className="suggested-task-desc">{t.description}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!transcriptResult.added && (
                    <button className="btn-add-all" onClick={() => addSuggestedTasks(transcriptResult.tasks)}>
                      + Add All Tasks to Board
                    </button>
                  )}
                  {transcriptResult.added && (
                    <div className="tasks-added">✓ Tasks added to your board</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="briefing-body">
          {briefings.length === 0 && <div className="briefing-hint">No briefings yet.</div>}
          {briefings.map(b => (
            <div key={b.id} className="history-item" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
              <div className="history-item-header">
                <span className="history-date">{b.createdAt ? format(b.createdAt.toDate(), 'MMM d, h:mm a') : '—'}</span>
                <span className="history-by">{b.addedBy}</span>
                <span className="history-count">{b.tasks?.length || 0} tasks</span>
              </div>
              {expanded === b.id && (
                <div className="history-item-body">
                  <div className="briefing-result-text">{b.summary}</div>
                  {b.tasks?.map((t, i) => (
                    <div key={i} className="suggested-task-title" style={{marginTop: 4}}>
                      <span className="suggested-priority" data-priority={t.priority}>{t.priority}</span> {t.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
