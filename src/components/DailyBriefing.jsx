import { useState, useEffect } from 'react'
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
  const [tab, setTab] = useState('summary')
  const [transcript, setTranscript] = useState('')
  const [transcriptResult, setTranscriptResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [briefings, setBriefings] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'briefings'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setBriefings(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const generateSummary = async () => {
    setSummaryLoading(true)
    setError('')
    try {
      const todoTasks = tasks.filter(t => t.status === 'todo' && !t.archived)
      const inProgress = tasks.filter(t => t.status === 'inprogress' && !t.archived)
      const testing = tasks.filter(t => t.status === 'testing' && !t.archived)
      const taskList = [
        ...inProgress.map(t => `[IN PROGRESS - ${t.priority}] ${t.title}`),
        ...testing.map(t => `[TESTING - ${t.priority}] ${t.title}`),
        ...todoTasks.map(t => `[TODO - ${t.priority}] ${t.title}`)
      ].join('\n') || 'No tasks yet'
      const result = await callClaude(
        `Here are my current tasks:\n\n${taskList}\n\nToday is ${format(new Date(), 'EEEE, MMMM d')}. Give me a focused daily briefing — what should I tackle today and in what order? Be concise and practical. Max 150 words.`,
        'You are a productivity assistant for a developer at an AI automation agency. Be direct, practical, and encouraging. No fluff.'
      )
      setSummary(result)
    } catch (e) { setError('API error: ' + e.message) }
    setSummaryLoading(false)
  }

  const processTranscript = async () => {
    if (!transcript.trim()) return
    setLoading(true); setError(''); setTranscriptResult(null)
    try {
      const result = await callClaude(
        `Here is a transcript or voice note:\n\n"${transcript}"\n\nRespond ONLY with valid JSON, no markdown:\n{"summary": "2-3 sentence summary", "tasks": [{"title": "task title", "priority": "critical|high|medium|low", "description": "brief context"}]}`,
        'You are a productivity assistant. Extract actionable tasks. Return only valid JSON.'
      )
      const parsed = JSON.parse(result.replace(/```json|```/g, '').trim())
      setTranscriptResult(parsed)
      await addDoc(collection(db, 'briefings'), {
        transcript: transcript.trim(), summary: parsed.summary, tasks: parsed.tasks,
        createdAt: serverTimestamp(), addedBy: auth.currentUser?.email || 'Walt', type: 'transcript'
      })
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  return (
    <div className="briefing">
      <div className="briefing-header">
        <div className="briefing-title"><span className="briefing-icon">⚡</span>Daily Briefing & AI Assistant</div>
        <div className="briefing-tabs">
          <button className={`btab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>Today's Plan</button>
          <button className={`btab ${tab === 'transcript' ? 'active' : ''}`} onClick={() => setTab('transcript')}>Transcripts</button>
          <button className={`btab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
        </div>
      </div>

      {tab === 'summary' && (
        <div className="briefing-body">
          <p className="briefing-hint">Claude analyzes your tasks and tells you what to focus on today.</p>
          <button className="btn-generate" onClick={generateSummary} disabled={summaryLoading}>
            {summaryLoading ? 'Generating...' : '✦ Generate Today\'s Plan'}
          </button>
          {error && <div className="briefing-error">{error}</div>}
          {summary && <div className="briefing-result"><div className="briefing-result-label">Today's Plan</div><div className="briefing-result-text">{summary}</div></div>}
        </div>
      )}

      {tab === 'transcript' && (
        <div className="briefing-body">
          <p className="briefing-hint">Paste a Loom transcript, voice note, or any notes from Jeremiah. Claude will summarize and extract tasks.</p>
          <textarea className="transcript-input" value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste transcript or notes here..." rows={6} />
          <button className="btn-generate" onClick={processTranscript} disabled={loading || !transcript.trim()}>
            {loading ? 'Processing...' : '✦ Extract Tasks from Transcript'}
          </button>
          {error && <div className="briefing-error">{error}</div>}
          {transcriptResult && (
            <div className="transcript-result">
              <div className="briefing-result"><div className="briefing-result-label">Summary</div><div className="briefing-result-text">{transcriptResult.summary}</div></div>
              {transcriptResult.tasks?.length > 0 && (
                <div className="suggested-tasks">
                  <div className="suggested-label">Suggested Tasks ({transcriptResult.tasks.length})</div>
                  {transcriptResult.tasks.map((t, i) => (
                    <div key={i} className="suggested-task">
                      <span className="suggested-priority" data-priority={t.priority}>{t.priority}</span>
                      <div><div className="suggested-task-title">{t.title}</div>{t.description && <div className="suggested-task-desc">{t.description}</div>}</div>
                    </div>
                  ))}
                  {!transcriptResult.added ? (
                    <button className="btn-add-all" onClick={() => { onAddTasks(transcriptResult.tasks); setTranscriptResult(p => ({...p, added: true})) }}>
                      + Add All Tasks to Board
                    </button>
                  ) : <div className="tasks-added">✓ Tasks added to your board</div>}
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
                    <div key={i} style={{marginTop:6,fontSize:12,display:'flex',gap:6,alignItems:'center'}}>
                      <span className="suggested-priority" data-priority={t.priority}>{t.priority}</span>{t.title}
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
