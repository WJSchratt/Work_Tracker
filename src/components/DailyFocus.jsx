import { useState, useEffect } from 'react'
import './DailyFocus.css'

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
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.[0]?.text || ''
}

export default function DailyFocus({ tasks }) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tasks.length > 0) generate()
  }, [])

  const generate = async () => {
    setLoading(true)
    try {
      const active = tasks.filter(t => !t.archived)
      const inProgress = active.filter(t => t.status === 'inprogress').map(t => t.title)
      const todo = active.filter(t => t.status === 'todo')
        .sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.priority] ?? 3) - ({ critical: 0, high: 1, medium: 2, low: 3 }[b.priority] ?? 3))
        .slice(0, 6).map(t => `[${t.priority}] ${t.title}`)
      const list = [...inProgress.map(t => `[IN PROGRESS] ${t}`), ...todo].join('\n') || 'No tasks'
      const result = await callClaude(`Tasks:\n${list}\n\nWrite exactly 2 sentences: what to focus on today and what's the top priority. Be direct and specific.`)
      setSummary(result)
    } catch (e) {
      setSummary('')
    }
    setLoading(false)
  }

  return (
    <div className="daily-focus">
      <div className="focus-icon">⚡</div>
      <div className="focus-text">
        {loading ? <span className="focus-loading">Generating today's focus...</span>
          : summary ? <span>{summary}</span>
          : <span className="focus-empty">Click ↻ to generate today's focus</span>}
      </div>
      <button className="focus-refresh" onClick={generate} title="Refresh" disabled={loading}>↻</button>
    </div>
  )
}
