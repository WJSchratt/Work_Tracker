import { useState, useEffect } from 'react'
import { db, auth } from './firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, setDoc, where
} from 'firebase/firestore'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { format, isToday, startOfWeek, endOfWeek, isWithinInterval, subDays } from 'date-fns'
import TaskCard from './components/TaskCard'
import TaskModal from './components/TaskModal'
import ClockPanel from './components/ClockPanel'
import Timesheet from './components/Timesheet'
import IssuesBoard from './components/IssuesBoard'
import DailyBriefing from './components/DailyBriefing'
import Login from './components/Login'
import './App.css'

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [tasks, setTasks] = useState([])
  const [clockState, setClockState] = useState(null)
  const [sessions, setSessions] = useState([])
  const [issues, setIssues] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [dragOverPriority, setDragOverPriority] = useState(null)
  const [view, setView] = useState('board')
  const [elapsed, setElapsed] = useState(0)
  const [lowExpanded, setLowExpanded] = useState(false)

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u || null))
  }, [])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'clock', 'current'), snap => {
      setClockState(snap.exists() ? snap.data() : null)
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'sessions'), orderBy('clockIn', 'desc'))
    return onSnapshot(q, snap => setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'issues'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setIssues(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  useEffect(() => {
    if (!clockState?.clockedIn) { setElapsed(0); return }
    const tick = () => setElapsed(Date.now() - new Date(clockState.clockIn).getTime())
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [clockState])

  // Auto-archive tasks done more than 7 days ago
  useEffect(() => {
    const sevenDaysAgo = subDays(new Date(), 7)
    tasks.forEach(t => {
      if (t.status === 'done' && !t.archived && t.updatedAt) {
        try {
          if (t.updatedAt.toDate() < sevenDaysAgo) {
            updateDoc(doc(db, 'tasks', t.id), { archived: true })
          }
        } catch {}
      }
    })
  }, [tasks])

  const clockIn = async () => {
    await setDoc(doc(db, 'clock', 'current'), { clockedIn: true, clockIn: new Date().toISOString() })
  }

  const clockOut = async () => {
    if (!clockState) return
    await addDoc(collection(db, 'sessions'), {
      clockIn: clockState.clockIn,
      clockOut: new Date().toISOString(),
      date: format(new Date(), 'yyyy-MM-dd'),
      durationMs: Date.now() - new Date(clockState.clockIn).getTime()
    })
    await deleteDoc(doc(db, 'clock', 'current'))
  }

  const addTask = async (data) => {
    await addDoc(collection(db, 'tasks'), {
      ...data, status: 'todo', archived: false,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), notes: []
    })
  }

  const updateTask = async (id, data) => {
    await updateDoc(doc(db, 'tasks', id), { ...data, updatedAt: serverTimestamp() })
  }

  const deleteTask = async (id) => {
    await deleteDoc(doc(db, 'tasks', id))
    setSelectedTask(null)
  }

  const archiveTask = async (id) => {
    await updateTask(id, { archived: true })
    setSelectedTask(null)
  }

  const moveTask = (id, newStatus) => updateTask(id, { status: newStatus })

  const onDragStart = (id) => setDragging(id)
  const onDragEnd = () => { setDragging(null); setDragOver(null); setDragOverPriority(null) }

  const onDropOnCard = async (e, targetId) => {
    e.preventDefault(); e.stopPropagation()
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    const target = tasks.find(t => t.id === targetId)
    if (target) await updateTask(dragging, { priority: target.priority, status: target.status })
    setDragging(null); setDragOver(null)
  }

  const onDropOnPriorityGroup = async (e, status, priority) => {
    e.preventDefault(); e.stopPropagation()
    if (!dragging) return
    await updateTask(dragging, { priority, status })
    setDragging(null); setDragOver(null); setDragOverPriority(null)
  }

  const onDropOnColumn = async (e, status) => {
    e.preventDefault()
    if (!dragging) return
    await moveTask(dragging, status)
    setDragging(null); setDragOver(null); setDragOverPriority(null)
  }

  // KPI
  const todayStoredMs = sessions
    .filter(s => { try { return isToday(new Date(s.clockIn)) } catch { return false } })
    .reduce((a, s) => a + (s.durationMs || 0), 0)
  const todayMs = todayStoredMs + elapsed

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

  const doneTodayCount = tasks.filter(t => {
    if (t.status !== 'done') return false
    try { return isToday(t.updatedAt?.toDate()) } catch { return false }
  }).length

  const doneWeekCount = tasks.filter(t => {
    if (t.status !== 'done') return false
    try {
      return isWithinInterval(t.updatedAt?.toDate(), {
        start: startOfWeek(new Date(), { weekStartsOn: 1 }),
        end: endOfWeek(new Date(), { weekStartsOn: 1 })
      })
    } catch { return false }
  }).length

  function fmtMs(ms) {
    const totalMin = Math.floor(ms / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const activeTasks = tasks.filter(t => !t.archived)
  const archivedTasks = tasks.filter(t => t.archived)
  const todoTasks = [...activeTasks.filter(t => t.status === 'todo')]
    .sort((a, b) => {
      const po = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
      if (po !== 0) return po
      return (a.groupOrder ?? 0) - (b.groupOrder ?? 0)
    })
  const inProgressTasks = activeTasks.filter(t => t.status === 'inprogress')
  const testingTasks = activeTasks.filter(t => t.status === 'testing')
  const doneTasks = activeTasks.filter(t => t.status === 'done')
  const priorities = ['critical', 'high', 'medium', 'low']

  const onDropWithinGroup = async (e, targetTask) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragging || dragging === targetTask.id) { setDragging(null); setDragOver(null); return }
    const dragTask = tasks.find(t => t.id === dragging)
    if (!dragTask || dragTask.priority !== targetTask.priority) return
    // Swap groupOrder values
    await updateTask(dragging, { groupOrder: targetTask.groupOrder ?? 0 })
    await updateTask(targetTask.id, { groupOrder: dragTask.groupOrder ?? 0 })
    setDragging(null); setDragOver(null)
  }

  const renderPriorityGroups = (colTasks, colKey) =>
    priorities.map(p => {
      const pTasks = colTasks.filter(t => t.priority === p)
        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
      const isGroupOver = dragOverPriority === `${colKey}-${p}`
      const isLow = p === 'low'
      const isCollapsed = isLow && !lowExpanded && pTasks.length > 0

      return (
        <div key={p}
          className={`priority-group ${isGroupOver ? 'group-drag-over' : ''} ${pTasks.length === 0 ? 'group-empty-group' : ''}`}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverPriority(`${colKey}-${p}`) }}
          onDragLeave={() => setDragOverPriority(null)}
          onDrop={e => onDropOnPriorityGroup(e, colKey, p)}
        >
          <div className="priority-group-label" data-priority={p}>
            <span className="priority-dot" data-priority={p} />
            {p}
            {pTasks.length > 0 && <span className="priority-group-count">{pTasks.length}</span>}
            {isLow && pTasks.length > 0 && (
              <button className="low-toggle" onClick={e => { e.stopPropagation(); setLowExpanded(v => !v) }}>
                {lowExpanded ? '▲ Hide' : '▼ Show'}
              </button>
            )}
          </div>
          {!isCollapsed && pTasks.map((task, idx) => (
            <TaskCard key={task.id} task={task}
              isDragging={dragging === task.id}
              isDragOver={dragOver === task.id}
              orderIndex={idx + 1}
              onDragStart={() => { onDragStart(task.id) }}
              onDragEnd={onDragEnd}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(task.id) }}
              onDrop={e => onDropWithinGroup(e, task)}
              onClick={() => setSelectedTask(task)}
            />
          ))}
          {isCollapsed && (
            <button className="low-show-btn" onClick={() => setLowExpanded(true)}>
              Show {pTasks.length} low priority task{pTasks.length !== 1 ? 's' : ''}
            </button>
          )}
          {pTasks.length === 0 && <div className="group-drop-hint">Drop to set {p}</div>}
        </div>
      )
    })

  const renderSimpleCol = (colTasks) =>
    colTasks.map(task => (
      <TaskCard key={task.id} task={task}
        isDragging={dragging === task.id} isDragOver={dragOver === task.id}
        onDragStart={() => onDragStart(task.id)} onDragEnd={onDragEnd}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(task.id) }}
        onDrop={e => onDropOnCard(e, task.id)}
        onClick={() => setSelectedTask(task)}
      />
    ))

  if (user === undefined) return <div className="app-loading">Loading...</div>
  if (user === null) return <Login />

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">PH</div>
          <div>
            <h1 className="header-title">PH Dev Work Platform</h1>
            <p className="header-date">{format(new Date(), 'EEEE, MMMM d')}</p>
          </div>
        </div>
        <div className="header-center">
          <button className={`view-tab ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>Board</button>
          <button className={`view-tab ${view === 'timesheet' ? 'active' : ''}`} onClick={() => setView('timesheet')}>Timesheet</button>
          <button className={`view-tab ${view === 'archive' ? 'active' : ''}`} onClick={() => setView('archive')}>
            Archive {archivedTasks.length > 0 && <span className="tab-badge">{archivedTasks.length}</span>}
          </button>
        </div>
        <div className="header-right">
          <ClockPanel clockState={clockState} onClockIn={clockIn} onClockOut={clockOut} todayMs={todayMs} />
          <button className="signout-btn" onClick={() => signOut(auth)} title="Sign out">↩</button>
        </div>
      </header>

      {view === 'timesheet' ? (
        <Timesheet sessions={sessions} />
      ) : view === 'archive' ? (
        <div className="archive-view">
          <h2 className="archive-heading">Archived Tasks <span className="archive-count">{archivedTasks.length}</span></h2>
          {archivedTasks.length === 0 && <div className="archive-empty">No archived tasks yet</div>}
          <div className="archive-list">
            {archivedTasks.map(task => (
              <div key={task.id} className="archive-item">
                <div className="archive-item-left">
                  <span className={`archive-priority`} data-priority={task.priority}>{task.priority}</span>
                  <span className="archive-title">{task.title}</span>
                  {task.description && <span className="archive-desc">{task.description.slice(0, 60)}{task.description.length > 60 ? '…' : ''}</span>}
                </div>
                <div className="archive-item-right">
                  <button className="archive-restore" onClick={() => updateTask(task.id, { archived: false, status: 'todo' })}>Restore</button>
                  <button className="archive-delete" onClick={() => deleteTask(task.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="board-layout">
          <div className="board-top-row">
            <DailyBriefing
              tasks={activeTasks}
              onAddTasks={(suggestedTasks) => {
                suggestedTasks.forEach(t => addTask({
                  title: t.title,
                  description: t.description || '',
                  priority: t.priority || 'medium',
                }))
              }}
            />
            <button className="btn-new" onClick={() => setShowNewTask(true)}>+ New Task</button>
          </div>

          <div className="board">
            {/* TO DO */}
            <div className="column column-todo">
              <div className="col-header">
                <span className="col-title">To Do</span>
                <span className="col-count">{todoTasks.length}</span>
              </div>
              <div className="col-body" onDragOver={e => e.preventDefault()} onDrop={e => onDropOnColumn(e, 'todo')}>
                {renderPriorityGroups(todoTasks, 'todo')}
                {todoTasks.length === 0 && <div className="empty-col" onDragOver={e => e.preventDefault()} onDrop={e => onDropOnColumn(e, 'todo')}>All clear — add a task</div>}
              </div>
            </div>

            {/* IN PROGRESS */}
            <div className="column column-inprogress">
              <div className="col-header">
                <span className="col-title">In Progress</span>
                <span className={`col-count ${inProgressTasks.length >= 2 ? 'count-warn' : ''}`}>{inProgressTasks.length}/2</span>
              </div>
              {inProgressTasks.length >= 2 && <div className="wip-warning">⚠ Focus — finish one before starting another</div>}
              <div className="col-body" onDragOver={e => e.preventDefault()} onDrop={e => onDropOnColumn(e, 'inprogress')}>
                {renderSimpleCol(inProgressTasks)}
                {inProgressTasks.length === 0 && <div className="empty-col" onDrop={e => onDropOnColumn(e, 'inprogress')} onDragOver={e => e.preventDefault()}>Drag a task here</div>}
              </div>
            </div>

            {/* DONE */}
            <div className="column column-done">
              <div className="col-header">
                <span className="col-title">Done</span>
                <span className="col-count">{doneTasks.length}</span>
              </div>
              <div className="col-body" onDragOver={e => e.preventDefault()} onDrop={e => onDropOnColumn(e, 'done')}>
                {renderSimpleCol(doneTasks)}
                {doneTasks.length === 0 && <div className="empty-col" onDrop={e => onDropOnColumn(e, 'done')} onDragOver={e => e.preventDefault()}>Completed tasks here</div>}
              </div>
            </div>
          </div>

          {/* TESTING QUEUE */}
          <div className="testing-queue">
            <div className="testing-header">
              <div className="testing-title">
                <span className="testing-dot" />
                Testing Queue
                <span className="col-count">{testingTasks.length}</span>
              </div>
              <span className="testing-hint">Built and ready to test before marking done</span>
            </div>
            <div className="testing-body" onDragOver={e => e.preventDefault()} onDrop={e => onDropOnColumn(e, 'testing')}>
              {testingTasks.length === 0 && <div className="testing-empty">Drop tasks here when ready to test</div>}
              {testingTasks.map(task => (
                <TaskCard key={task.id} task={task}
                  isDragging={dragging === task.id} isDragOver={dragOver === task.id}
                  onDragStart={() => onDragStart(task.id)} onDragEnd={onDragEnd}
                  onDragOver={e => { e.preventDefault(); setDragOver(task.id) }}
                  onDrop={e => onDropOnCard(e, task.id)}
                  onClick={() => setSelectedTask(task)}
                  horizontal
                />
              ))}
            </div>
          </div>

          {/* ISSUES BOARD */}
          <IssuesBoard issues={issues} currentUser={user} />

          {/* KPI */}
          <div className="kpi-section">
            <div className="kpi-grid">
              <div className="kpi-item"><div className="kpi-label">Today's Hours</div><div className="kpi-val kpi-accent">{fmtMs(todayMs)}</div></div>
              <div className="kpi-divider" />
              <div className="kpi-item"><div className="kpi-label">This Week</div><div className="kpi-val">{fmtMs(weekMs)}</div></div>
              <div className="kpi-divider" />
              <div className="kpi-item"><div className="kpi-label">Done Today</div><div className="kpi-val kpi-green">{doneTodayCount}</div></div>
              <div className="kpi-divider" />
              <div className="kpi-item"><div className="kpi-label">Done This Week</div><div className="kpi-val kpi-green">{doneWeekCount}</div></div>
              <div className="kpi-divider" />
              <div className="kpi-item"><div className="kpi-label">Active Tasks</div><div className="kpi-val">{activeTasks.filter(t => t.status !== 'done').length}</div></div>
              <div className="kpi-divider" />
              <div className="kpi-item"><div className="kpi-label">In Testing</div><div className="kpi-val kpi-amber">{testingTasks.length}</div></div>
            </div>
          </div>
        </div>
      )}

      {(selectedTask || showNewTask) && (
        <TaskModal
          task={selectedTask}
          onClose={() => { setSelectedTask(null); setShowNewTask(false) }}
          onSave={selectedTask ? (data) => updateTask(selectedTask.id, data) : addTask}
          onDelete={selectedTask ? () => deleteTask(selectedTask.id) : null}
          onArchive={selectedTask ? () => archiveTask(selectedTask.id) : null}
          onMove={selectedTask ? (status) => { moveTask(selectedTask.id, status); setSelectedTask(null) } : null}
        />
      )}
    </div>
  )
}
