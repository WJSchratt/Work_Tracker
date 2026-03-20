import { useState, useEffect } from 'react'
import { db } from './firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, setDoc, getDoc
} from 'firebase/firestore'
import { format, isToday, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'
import TaskCard from './components/TaskCard'
import TaskModal from './components/TaskModal'
import ClockPanel from './components/ClockPanel'
import KPIBar from './components/KPIBar'
import './App.css'

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export default function App() {
  const [tasks, setTasks] = useState([])
  const [clockState, setClockState] = useState(null)
  const [sessions, setSessions] = useState([])
  const [clients, setClients] = useState(['Profit Hexagon', 'Andrew Gerbers', 'Insurance AI', 'School'])
  const [selectedTask, setSelectedTask] = useState(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [filterClient, setFilterClient] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'clock', 'current'), snap => {
      if (snap.exists()) setClockState(snap.data())
      else setClockState(null)
    })
    return unsub
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'sessions'), orderBy('clockIn', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'main'), snap => {
      if (snap.exists() && snap.data().clients) setClients(snap.data().clients)
    })
    return unsub
  }, [])

  const saveClients = async (list) => {
    setClients(list)
    await setDoc(doc(db, 'settings', 'main'), { clients: list }, { merge: true })
  }

  const clockIn = async () => {
    await setDoc(doc(db, 'clock', 'current'), {
      clockedIn: true,
      clockIn: new Date().toISOString(),
      note: ''
    })
  }

  const clockOut = async () => {
    if (!clockState) return
    await addDoc(collection(db, 'sessions'), {
      clockIn: clockState.clockIn,
      clockOut: new Date().toISOString(),
      note: clockState.note || '',
      durationMs: Date.now() - new Date(clockState.clockIn).getTime()
    })
    await deleteDoc(doc(db, 'clock', 'current'))
  }

  const addTask = async (data) => {
    await addDoc(collection(db, 'tasks'), {
      ...data,
      status: 'todo',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notes: [],
      order: tasks.length
    })
    if (data.client && !clients.includes(data.client)) {
      saveClients([...clients, data.client])
    }
  }

  const updateTask = async (id, data) => {
    await updateDoc(doc(db, 'tasks', id), { ...data, updatedAt: serverTimestamp() })
  }

  const deleteTask = async (id) => {
    await deleteDoc(doc(db, 'tasks', id))
    setSelectedTask(null)
  }

  const moveTask = async (id, newStatus) => {
    await updateTask(id, { status: newStatus })
  }

  const onDragStart = (id) => setDragging(id)
  const onDragEnd = () => { setDragging(null); setDragOver(null) }
  const onDragOver = (e, id) => { e.preventDefault(); setDragOver(id) }
  const onDrop = async (e, targetId) => {
    e.preventDefault()
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    const target = tasks.find(t => t.id === targetId)
    if (target) await updateTask(dragging, { priority: target.priority, status: target.status })
    setDragging(null); setDragOver(null)
  }

  const todayMs = sessions
    .filter(s => isToday(new Date(s.clockIn)))
    .reduce((a, s) => a + (s.durationMs || 0), 0)

  const weekMs = sessions
    .filter(s => {
      try {
        return isWithinInterval(new Date(s.clockIn), {
          start: startOfWeek(new Date(), { weekStartsOn: 1 }),
          end: endOfWeek(new Date(), { weekStartsOn: 1 })
        })
      } catch { return false }
    })
    .reduce((a, s) => a + (s.durationMs || 0), 0)

  const completedToday = tasks.filter(t => {
    if (t.status !== 'done') return false
    if (!t.updatedAt) return false
    try { return isToday(t.updatedAt.toDate()) } catch { return false }
  }).length

  let filtered = tasks
  if (filterClient !== 'all') filtered = filtered.filter(t => t.client === filterClient)
  if (filterStatus !== 'all') filtered = filtered.filter(t => t.status === filterStatus)
  filtered = [...filtered].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))

  const statuses = [
    { key: 'todo', label: 'To Do' },
    { key: 'inprogress', label: 'In Progress' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'done', label: 'Done' }
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">WT</div>
          <div>
            <h1 className="header-title">Walt's Work Tracker</h1>
            <p className="header-date">{format(new Date(), 'EEEE, MMMM d')}</p>
          </div>
        </div>
        <div className="header-right">
          <ClockPanel clockState={clockState} onClockIn={clockIn} onClockOut={clockOut} todayMs={todayMs} />
        </div>
      </header>

      <KPIBar
        todayMs={todayMs}
        weekMs={weekMs}
        completedToday={completedToday}
        totalTasks={tasks.length}
        inProgress={tasks.filter(t => t.status === 'inprogress').length}
        blocked={tasks.filter(t => t.status === 'blocked').length}
      />

      <div className="toolbar">
        <div className="filters">
          <button className={`filter-pill ${filterClient === 'all' ? 'active' : ''}`} onClick={() => setFilterClient('all')}>All</button>
          {clients.map(c => (
            <button key={c} className={`filter-pill ${filterClient === c ? 'active' : ''}`} onClick={() => setFilterClient(c)}>{c}</button>
          ))}
        </div>
        <div className="toolbar-right">
          <select className="status-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn-new" onClick={() => setShowNewTask(true)}>+ New Task</button>
        </div>
      </div>

      <div className="board">
        {statuses.map(col => {
          const colTasks = filtered.filter(t => t.status === col.key)
          return (
            <div key={col.key} className="column">
              <div className="col-header">
                <span className="col-title">{col.label}</span>
                <span className="col-count">{colTasks.length}</span>
              </div>
              <div
                className="col-body"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (dragging) moveTask(dragging, col.key); setDragging(null); setDragOver(null) }}
              >
                {colTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={dragging === task.id}
                    isDragOver={dragOver === task.id}
                    onDragStart={() => onDragStart(task.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={e => onDragOver(e, task.id)}
                    onDrop={e => onDrop(e, task.id)}
                    onClick={() => setSelectedTask(task)}
                  />
                ))}
                {colTasks.length === 0 && (
                  <div
                    className="empty-col"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); if (dragging) moveTask(dragging, col.key); setDragging(null) }}
                  >
                    Drop here
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {(selectedTask || showNewTask) && (
        <TaskModal
          task={selectedTask}
          clients={clients}
          onSaveClients={saveClients}
          onClose={() => { setSelectedTask(null); setShowNewTask(false) }}
          onSave={selectedTask ? (data) => updateTask(selectedTask.id, data) : addTask}
          onDelete={selectedTask ? () => deleteTask(selectedTask.id) : null}
          onMove={selectedTask ? (status) => { moveTask(selectedTask.id, status); setSelectedTask(null) } : null}
        />
      )}
    </div>
  )
}
