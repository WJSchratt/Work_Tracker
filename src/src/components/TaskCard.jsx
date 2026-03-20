import './TaskCard.css'

const PRIORITY_COLORS = { critical: '#ef4444', high: '#f59e0b', medium: '#6c63ff', low: '#22c55e' }

export default function TaskCard({ task, isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop, onClick, horizontal, orderIndex }) {
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
  const hasVoice = task.voiceNotes?.length > 0
  const hasNotes = task.notes?.length > 0
  const totalActivity = (task.voiceNotes?.length || 0) + (task.notes?.length || 0)

  return (
    <div
      className={`task-card ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${horizontal ? 'horizontal' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
    >
      <div className="card-priority-bar" style={{ background: p }} />
      <div className="card-inner">
        <div className="card-title-row">
          {orderIndex && <span className="card-order">#{orderIndex}</span>}
          <div className="card-title">{task.title}</div>
          {totalActivity > 0 && <div className="card-activity-dot" title={`${totalActivity} update${totalActivity !== 1 ? 's' : ''}`} />}
        </div>
        {!horizontal && task.description && (
          <div className="card-desc">{task.description.slice(0, 100)}{task.description.length > 100 ? '...' : ''}</div>
        )}
        <div className="card-footer">
          <span className="priority-label" style={{ color: p }}>{task.priority}</span>
          <div className="card-badges">
            {hasVoice && <span className="card-badge voice-badge">mic {task.voiceNotes.length}</span>}
            {hasNotes && <span className="card-badge notes-badge">note {task.notes.length}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
